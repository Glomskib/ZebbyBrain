import { AppShell } from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusOnly } from "@/components/shell/Gate";
import { Moon, CloudRain, Waves, Wind, Play } from "lucide-react";

const SOUNDS = [
  { id: "rain", title: "Soft rain", icon: <CloudRain className="w-5 h-5" />, length: "60 min loop" },
  { id: "ocean", title: "Ocean breath", icon: <Waves className="w-5 h-5" />, length: "45 min loop" },
  { id: "wind", title: "Prairie wind", icon: <Wind className="w-5 h-5" />, length: "30 min loop" },
  { id: "brown", title: "Brown noise (low-sensory)", icon: <Moon className="w-5 h-5" />, length: "Continuous" },
];

export default function ZzzebbySounds() {
  return (
    <AppShell title="Zzzebby Sounds" subtitle="Sleep + sensory-friendly soundscapes">
      <div className="space-y-6">
        <PlusOnly
          featureName="Zzzebby Sounds"
          description="Curated low-stimulation audio that loops cleanly for naps, migraines, and the whirring brain days."
        >
          <div className="grid md:grid-cols-2 gap-4">
            {SOUNDS.map((s) => (
              <Card key={s.id} className="rounded-2xl">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 flex items-center justify-center">
                    {s.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.length}</div>
                  </div>
                  <Button size="sm" className="rounded-full" data-testid={`button-sound-play-${s.id}`}>
                    <Play className="w-4 h-4 mr-1" /> Play
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </PlusOnly>
        <Card className="rounded-2xl">
          <CardContent className="p-5 text-sm text-muted-foreground">
            All Zzzebby sounds are designed to loop without a jump, and start quietly so they won't
            jolt you. Headphones recommended for hyperacusis-friendly variants.
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
