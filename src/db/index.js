import { jobsDb } from './jobs.js';

export { jobsDb };

export function initDatabase() {
  return jobsDb.init();
}

export default jobsDb;