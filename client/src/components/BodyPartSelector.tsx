import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const BODY_PARTS = [
  { value: "head", label: "Head" },
  { value: "jaw", label: "Jaw" },
  { value: "neck", label: "Neck" },
  { value: "shoulder_left", label: "Shoulder (L)" },
  { value: "shoulder_right", label: "Shoulder (R)" },
  { value: "elbow_left", label: "Elbow (L)" },
  { value: "elbow_right", label: "Elbow (R)" },
  { value: "wrist_left", label: "Wrist (L)" },
  { value: "wrist_right", label: "Wrist (R)" },
  { value: "back_upper", label: "Upper Back" },
  { value: "back_lower", label: "Lower Back" },
  { value: "chest", label: "Chest" },
  { value: "abdomen", label: "Abdomen" },
  { value: "hip_left", label: "Hip (L)" },
  { value: "hip_right", label: "Hip (R)" },
  { value: "knee_left", label: "Knee (L)" },
  { value: "knee_right", label: "Knee (R)" },
  { value: "ankle_left", label: "Ankle (L)" },
  { value: "ankle_right", label: "Ankle (R)" },
] as const;

export type BodyPart = (typeof BODY_PARTS)[number]["value"];

const SIDES = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "bilateral", label: "Both Sides" },
] as const;

export type Side = (typeof SIDES)[number]["value"] | null;

interface BodyPartSelectorProps {
  value?: BodyPart;
  side?: Side;
  onChange: (part: BodyPart) => void;
  onSideChange?: (side: Side) => void;
  showSide?: boolean;
}

export function BodyPartSelector({
  value,
  side,
  onChange,
  onSideChange,
  showSide = true,
}: BodyPartSelectorProps) {
  const needsSide = value && (
    value.includes("shoulder") ||
    value.includes("elbow") ||
    value.includes("wrist") ||
    value.includes("hip") ||
    value.includes("knee") ||
    value.includes("ankle")
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base mb-3 block">Select Body Part (Optional)</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {BODY_PARTS.map((part) => (
            <Button
              key={part.value}
              type="button"
              variant={value === part.value ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(part.value)}
              data-testid={`button-body-part-${part.value}`}
              className="justify-start"
            >
              {part.label}
            </Button>
          ))}
        </div>
      </div>

      {showSide && needsSide && onSideChange && (
        <div>
          <Label className="text-base mb-2 block">Side</Label>
          <RadioGroup
            value={side || ""}
            onValueChange={(val) => onSideChange(val as Side)}
            data-testid="radio-group-side"
          >
            {SIDES.map((s) => (
              <div key={s.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={s.value}
                  id={`side-${s.value}`}
                  data-testid={`radio-side-${s.value}`}
                />
                <Label htmlFor={`side-${s.value}`} className="cursor-pointer">
                  {s.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange("" as BodyPart);
            if (onSideChange) onSideChange(null);
          }}
          data-testid="button-clear-body-part"
        >
          Clear Selection
        </Button>
      )}
    </div>
  );
}

// Simple filter component for insights page
interface BodyPartFilterProps {
  value?: BodyPart | "";
  onChange: (part: BodyPart | "") => void;
}

export function BodyPartFilter({ value, onChange }: BodyPartFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Label>Filter by Body Part:</Label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value as BodyPart | "")}
        className="px-3 py-1 border rounded-md bg-background"
        data-testid="select-body-part-filter"
      >
        <option value="">All Parts</option>
        {BODY_PARTS.map((part) => (
          <option key={part.value} value={part.value}>
            {part.label}
          </option>
        ))}
      </select>
    </div>
  );
}
