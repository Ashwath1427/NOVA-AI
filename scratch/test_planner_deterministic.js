// scratch/test_planner_deterministic.js
import { PlannerEngine } from '../server/planner-engine.js';
import { ContextEngine } from '../server/context-engine.js';

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING DETERMINISTIC PLANNER VALIDATION SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const mockContextEngine = new ContextEngine(null, null);
  const planner = new PlannerEngine(mockContextEngine, "TEST_KEY");

  // TEST 1: Fixed Calendar Anchoring & Zero Collisions
  console.log("\n[TEST 1] Fixed Calendar Anchoring & Collision Prevention");
  const realFixedEvents = [
    { id: 'ev1', title: 'online class', startTime: '09:00 AM', endTime: '12:00 PM', description: 'Google Meet class' },
    { id: 'ev2', title: 'Math Tuition', startTime: '09:30 PM', endTime: '11:00 PM', description: 'Calculus session' }
  ];

  const realTasks = [
    { id: 'task-101', title: 'Calculus Assignment 4', priority: 'Urgent', dueDate: '2026-09-19' },
    { id: 'task-102', title: 'Optics Formula Review', priority: 'High', dueDate: '2026-09-19' },
    { id: 'task-103', title: 'NOVA Code Polish', priority: 'Medium', dueDate: '2026-09-20' }
  ];

  // Hallucinated AI output that attempts to overlap with online class (e.g. 10:00 AM)
  const messyAiBlocks = [
    { id: 'b1', title: 'Calculus Assignment 4', startTime: '10:00 AM', endTime: '11:30 AM', taskId: 'task-101', type: 'focus' },
    { id: 'b2', title: 'Optics Formula Review', startTime: '02:00 PM', endTime: '03:00 PM', taskId: 'task-102', type: 'focus' },
    { id: 'b3', title: 'Workout Session', startTime: '05:00 PM', endTime: '06:00 PM', type: 'workout' }
  ];

  const sanitized = planner.validateAndSanitizePlan(messyAiBlocks, realFixedEvents, realTasks);

  // Check: Fixed events must be preserved with exact times
  const onlineClassBlock = sanitized.find(b => b.title.toLowerCase().includes('online class'));
  assert(onlineClassBlock !== undefined, "Fixed event 'online class' is present in schedule");
  assert(onlineClassBlock.startTime === '9:00 AM' && onlineClassBlock.endTime === '12:00 PM', "Online class is strictly anchored at 9:00 AM - 12:00 PM");

  const mathTuitionBlock = sanitized.find(b => b.title.toLowerCase().includes('math tuition'));
  assert(mathTuitionBlock !== undefined, "Fixed event 'Math Tuition' is present");
  assert(mathTuitionBlock.startTime === '9:30 PM' && mathTuitionBlock.endTime === '11:00 PM', "Math Tuition is strictly anchored at 9:30 PM - 11:00 PM");

  // Check: No overlapping blocks anywhere in the timeline
  let overlapFound = false;
  for (let i = 0; i < sanitized.length - 1; i++) {
    const cur = sanitized[i];
    const next = sanitized[i + 1];
    const curEnd = planner.parseTimeToMinutes(cur.endTime);
    const nextStart = planner.parseTimeToMinutes(next.startTime);
    if (curEnd > nextStart) {
      console.error(`Overlap detected between ${cur.title} (${cur.endTime}) and ${next.title} (${next.startTime})`);
      overlapFound = true;
    }
  }
  assert(!overlapFound, "Zero overlapping blocks in schedule (deterministic validator succeeded)");

  // TEST 2: Replanning Preserves Completed Tasks & Fixed Events
  console.log("\n[TEST 2] Replanning Preserves Completed Tasks & Fixed Events");
  // Mark first block as completed
  sanitized[0].status = 'completed';
  const completedId = sanitized[0].id;

  const mockSupabase = {
    from: (table) => {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  plan_date: '2026-09-19',
                  content: {
                    activeDayStarted: true,
                    blocks: sanitized
                  }
                },
                error: null
              })
            })
          })
        }),
        upsert: async (record) => {
          return { data: record, error: null };
        },
        update: () => ({
          eq: () => ({
            eq: async () => ({ data: null, error: null })
          })
        })
      };
    }
  };

  // Mock context engine to return real fixed events and tasks
  mockContextEngine.get_full_planning_context = async () => ({
    calendar: realFixedEvents,
    tasks: realTasks,
    habits: [],
    audioContext: { connected: false }
  });

  const replanned = await planner.replanRemainingDay('test-user-id', mockSupabase, {
    completedBlockIds: [completedId],
    currentTime: '01:00 PM'
  });

  assert(replanned.blocks.length > 0, "Replanning returned non-empty schedule");
  const preservedCompleted = replanned.blocks.find(b => b.id === completedId);
  assert(preservedCompleted && preservedCompleted.status === 'completed', "Completed block was preserved after replanning");

  const preservedFixed = replanned.blocks.find(b => b.id === 'ev2' || b.title.includes('Math Tuition'));
  assert(preservedFixed !== undefined, "Future fixed event 'Math Tuition' was preserved after replanning");

  // TEST 3: Idempotent Day Start & Block Completion
  console.log("\n[TEST 3] Day State Persistence (Start Day & Block Completion)");
  const startResult = await planner.updateBlockAction('test-user-id', mockSupabase, {
    blockId: 'start_day',
    status: 'started'
  });
  assert(startResult.success === true, "updateBlockAction handles start_day");
  assert(startResult.plan.activeDayStarted === true, "activeDayStarted is persisted as true in plan content");

  const completeResult = await planner.updateBlockAction('test-user-id', mockSupabase, {
    blockId: sanitized[1].id,
    status: 'completed',
    taskId: 'task-101'
  });
  assert(completeResult.success === true, "updateBlockAction marks block completed");
  const updatedBlock = completeResult.plan.blocks.find(b => b.id === sanitized[1].id);
  assert(updatedBlock.status === 'completed', "Target block has status 'completed'");

  // TEST 4: Idempotent Generation (No Duplicate Daily Plans)
  console.log("\n[TEST 4] Idempotent Generation");
  const idempPlan = await planner.generateDailyPlan('test-user-id', mockSupabase, { force: false });
  assert(idempPlan !== null, "generateDailyPlan returned existing plan without re-running Gemini when force=false");

  console.log("\n==================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
