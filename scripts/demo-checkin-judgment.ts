import { isCheckinComplete } from "../core/checkinJudgment.js";

const queue = [{ questionId: "q0001" }, { questionId: "q0002" }];
const assignedBlockIds = ["b0001", "b0002"];

const scenarios: [string, Parameters<typeof isCheckinComplete>[0]][] = [
  [
    "block 没读完，题也没做完",
    {
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001"]),
      queue,
      answeredQuestionIds: new Set(),
    },
  ],
  [
    "block 读完了，但还有一道题没做",
    {
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001", "b0002"]),
      queue,
      answeredQuestionIds: new Set(["q0001"]),
    },
  ],
  [
    "block 读完了，题也全做完了（不管对错，也不管花了多久）",
    {
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001", "b0002"]),
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    },
  ],
];

for (const [label, input] of scenarios) {
  console.log(`${label} -> pass=${isCheckinComplete(input)}`);
}
