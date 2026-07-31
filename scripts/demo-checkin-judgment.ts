import { isCheckinComplete } from "../core/checkinJudgment.js";

const queue = [{ questionId: "q0001" }, { questionId: "q0002" }];

const scenarios: [string, Parameters<typeof isCheckinComplete>[0]][] = [
  [
    "读得不够，题也没做完",
    { totalReadSeconds: 200, targetSeconds: 720, queue, answeredQuestionIds: new Set() },
  ],
  [
    "读够了，但还有一道题没做",
    { totalReadSeconds: 720, targetSeconds: 720, queue, answeredQuestionIds: new Set(["q0001"]) },
  ],
  [
    "读够了，题也全做完了（不管对错）",
    {
      totalReadSeconds: 720,
      targetSeconds: 720,
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    },
  ],
];

for (const [label, input] of scenarios) {
  console.log(`${label} -> pass=${isCheckinComplete(input)}`);
}
