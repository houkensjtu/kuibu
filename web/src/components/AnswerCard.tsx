import { Check, X } from "lucide-react";
import type { Question } from "../../../schema/types/pack";
import type { ShuffledOptions } from "../../../core/questionQueue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnswerCardProps {
  question: Question;
  shuffled: ShuffledOptions;
  questionNumber: number;
  totalQuestions: number;
  selectedIndex: number | null;
  submitted: boolean;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onNext: () => void;
  isLast: boolean;
}

/**
 * One question fills the content area (web brief: "一张卡片占满内容区").
 * Selecting an option only highlights it -- judging happens on "Confirm",
 * never on click (brief: "不要点选项即判分"). `shuffled` must be computed
 * once per question by the caller and handed down, not recomputed here --
 * recomputing on every render would reshuffle on every click (brief
 * pitfall #4, the easiest bug to introduce in this whole app).
 */
export function AnswerCard({
  question,
  shuffled,
  questionNumber,
  totalQuestions,
  selectedIndex,
  submitted,
  onSelect,
  onConfirm,
  onNext,
  isLast,
}: AnswerCardProps) {
  const correct = submitted && selectedIndex === shuffled.answerIndex;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">
        Question {questionNumber} of {totalQuestions}
      </p>
      <p className="text-base text-foreground">{question.prompt}</p>

      <div className="flex flex-col gap-2">
        {shuffled.options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const isCorrectAnswer = index === shuffled.answerIndex;
          const showCorrect = submitted && isCorrectAnswer;
          const showWrong = submitted && isSelected && !isCorrectAnswer;

          return (
            <button
              key={index}
              type="button"
              disabled={submitted}
              onClick={() => onSelect(index)}
              className={cn(
                "flex min-h-11 items-center justify-between gap-2 rounded-md border px-4 py-2 text-left text-sm transition-colors",
                "border-border",
                isSelected && !submitted && "border-foreground bg-accent",
                showCorrect && "border-primary bg-accent",
                showWrong && "border-destructive",
                submitted && !isSelected && !isCorrectAnswer && "opacity-60",
              )}
            >
              <span>{option}</span>
              {showCorrect && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              {showWrong && <X className="size-4 shrink-0 text-destructive" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {submitted && !correct && (
        <p className="text-sm text-muted-foreground">{question.explanation}</p>
      )}

      {!submitted ? (
        <Button size="lg" className="w-full" disabled={selectedIndex === null} onClick={onConfirm}>
          Confirm
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={onNext}>
          {isLast ? "Finish check-in" : "Next question"}
        </Button>
      )}
    </div>
  );
}
