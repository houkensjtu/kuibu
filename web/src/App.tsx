import { checkinDate } from "../../core/checkinDate";
import { Button } from "@/components/ui/button";

function App() {
  const today = checkinDate(new Date());

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg text-foreground">
        kuibu web is deploying correctly — today&apos;s check-in date is {today}.
      </p>
      <Button variant="secondary" size="sm">
        stone
      </Button>
    </main>
  );
}

export default App;
