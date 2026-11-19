// The hiring systems a board can run on: one adapter each. The registry
// (data/employers/boards.json) names one of these keys per employer.
import * as ashby from './ashby.mjs';
import * as greenhouse from './greenhouse.mjs';
import * as jibe from './jibe.mjs';
import * as lever from './lever.mjs';
import * as oracle from './oracle.mjs';
import * as successfactors from './successfactors.mjs';
import * as workday from './workday.mjs';

export const SYSTEMS = { ashby, greenhouse, jibe, lever, oracle, successfactors, workday };
