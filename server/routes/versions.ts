import { Router, type NextFunction, type Request, type Response } from 'express';
import { db } from '../db/index.js';
import { canManageCompany, getSessionUser, handle } from '../lib/auth.js';
import { answerRefusal } from '../lib/records.js';
import { addVersion, changeVersion, findVersionCompany, readVersion, removeVersion, versionJobs, versionsOfCompany } from '../lib/versions.js';
import { isUuid } from '../lib/writes.js';
import { uuidParam } from '../middleware/validateUuid.js';

/**
 * A company's versions of careers, under the company:
 *
 *   GET    /api/companies/:company/careers                 its versions
 *   GET    /api/companies/:company/careers/:occupationId   one version as a path ready to draw
 *   POST   /api/companies/:company/careers                 { occupationId }: add one, with no changes yet
 *   PUT    /api/companies/:company/careers/:occupationId   { added?, leftOut?, makes? }: its changes
 *   DELETE /api/companies/:company/careers/:occupationId
 *
 * Reads are public; `:company` is the company's id or, for a read, its slug.
 * Writes take one of the company's active members or an admin
 * (`canManageCompany`): 401 signed out, 403 otherwise. This router is mounted
 * ahead of /api/companies, whose own writes are an admin's alone.
 *
 * Nothing here is cached at the edge: the editor saves whole lists built from
 * what it read, so what it reads has to be what is stored.
 */
const router = Router({ mergeParams: true });
router.param('occupationId', uuidParam);

// The company, by id or slug, found once: the handlers below read its id from `companyOf`, never from the
// address. (A parameter of the path this router is mounted on is set afresh for each handler, so an id written
// to `req.params` here does not reach them: a slug used to arrive at the statement as if it were an id.)
router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.company;
    if (req.method !== 'GET' && !isUuid(raw)) {
      res.status(400).json({ error: 'Invalid id: expected a UUID' });
      return;
    }
    const company = await findVersionCompany(db, raw);
    if (!company) {
      res.status(isUuid(raw) || /^[a-z0-9][a-z0-9-]{0,79}$/i.test(raw) ? 404 : 400).json({ error: 'Company not found' });
      return;
    }
    res.locals.company = company;
    next();
  } catch (error) {
    next(error);
  }
});

/** The id of the company the address names, as the middleware above found it. */
const companyOf = (res: Response): string => (res.locals.company as { id: string }).id;

/** Continue only for someone who may act for the company: 401 signed out, 403 otherwise. */
function requireCompanyWriter(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req).then(async (user) => {
    if (!user) res.status(401).json({ error: 'Sign in required' });
    else if (!(await canManageCompany(user, companyOf(res)))) res.status(403).json({ error: "Only the company's own people can change its careers." });
    else next();
  }, next).catch(next);
}

router.get(
  '/',
  handle(async (_req: Request, res) => {
    res.json({ company: res.locals.company, versions: await versionsOfCompany(companyOf(res)) });
  })
);

router.get(
  '/:occupationId',
  handle(async (req: Request, res) => {
    const occupationId = req.params.occupationId;
    const version = await readVersion(db, companyOf(res), occupationId);
    if (!version) return res.status(404).json({ error: 'This company has no version of that career.' });
    res.json({ ...version, jobs: await versionJobs(companyOf(res), occupationId) });
  })
);

router.post('/', requireCompanyWriter, async (req: Request, res: Response) => {
  try {
    res.status(201).json(await addVersion(req.user!, companyOf(res), req.body?.occupationId));
  } catch (error) {
    answerRefusal(res, error, 'career version');
  }
});

router.put('/:occupationId', requireCompanyWriter, async (req: Request, res: Response) => {
  try {
    res.json(await changeVersion(req.user!, companyOf(res), req.params.occupationId, req.body));
  } catch (error) {
    answerRefusal(res, error, 'career version');
  }
});

router.delete('/:occupationId', requireCompanyWriter, async (req: Request, res: Response) => {
  try {
    const gone = await removeVersion(req.user!, companyOf(res), req.params.occupationId);
    if (!gone) {
      res.status(404).json({ error: 'This company has no version of that career.' });
      return;
    }
    res.json({ ok: true, title: gone.title });
  } catch (error) {
    answerRefusal(res, error, 'career version');
  }
});

export default router;
