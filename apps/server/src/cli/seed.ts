/** npm run db:seed  -  loads the grading weights and the sample strands, subjects and curriculum. */
import { createDb } from '../db';
import { seedBaseData } from '../seed-data';

const db = createDb();
await seedBaseData(db, { sampleCurriculum: true });
const [strands, subjects, curriculum] = await Promise.all([db.strand.count(), db.subject.count(), db.curriculumSubject.count()]);
console.log(`Base data ready: ${strands} strands, ${subjects} subjects, ${curriculum} curriculum entries.`);
await db.$disconnect();
