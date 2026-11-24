// The hiring systems a board can run on: one adapter each. The registry
// (data/employers/boards.json) names one of these keys per employer.
import * as ashby from './ashby.mjs';
import * as greenhouse from './greenhouse.mjs';
import * as icims from './icims.mjs';
import * as jibe from './jibe.mjs';
import * as lever from './lever.mjs';
import * as oracle from './oracle.mjs';
import * as successfactors from './successfactors.mjs';
import * as successfactorsSite from './successfactors-site.mjs';
import * as workday from './workday.mjs';

export const SYSTEMS = { ashby, greenhouse, icims, jibe, lever, oracle, successfactors, 'successfactors-site': successfactorsSite, workday };
