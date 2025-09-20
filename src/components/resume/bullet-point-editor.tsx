"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, GripVertical } from "lucide-react";

interface BulletPointEditorProps {
  label: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export default function BulletPointEditor({
  label,
  placeholder = "Enter a responsibility or achievement...",
  value = [],
  onChange,
  className = "",
}: BulletPointEditorProps) {
  const [newPoint, setNewPoint] = useState("");

  const addBulletPoint = () => {
    if (newPoint.trim()) {
      onChange([...value, newPoint.trim()]);
      setNewPoint("");
    }
  };

  const removeBulletPoint = (index: number) => {
    const newValue = value.filter((_, i) => i !== index);
    onChange(newValue);
  };

  const updateBulletPoint = (index: number, newText: string) => {
    const newValue = [...value];
    newValue[index] = newText;
    onChange(newValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBulletPoint();
    }
  };

  return (
    <div className={className}>
      <Label className="text-sm font-medium">{label}</Label>

      {/* Add new bullet point */}
      <div className="flex gap-2 mt-2 mb-3">
        <Input
          type="text"
          placeholder={placeholder}
          value={newPoint}
          onChange={(e) => setNewPoint(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1"
        />
        <Button
          type="button"
          onClick={addBulletPoint}
          disabled={!newPoint.trim()}
          size="sm"
          className="px-3"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Existing bullet points */}
      {value.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Current bullet points:
          </Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {value.map((point, index) => (
              <Card key={index} className="p-3 bg-muted/50">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  <Input
                    type="text"
                    value={point}
                    onChange={(e) => updateBulletPoint(index, e.target.value)}
                    className="flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                    placeholder="Edit this bullet point..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBulletPoint(index)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {value.length > 0 && (
        <div className="mt-4 p-3 bg-card border rounded-md">
          <Label className="text-xs text-muted-foreground mb-2 block">
            Preview:
          </Label>
          <ul className="list-disc list-inside text-sm space-y-1">
            {value.map((point, index) => (
              <li key={index} className="leading-relaxed">
                {point || (
                  <span className="text-muted-foreground italic">
                    Empty bullet point
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          No bullet points added yet. Add your first one above.
        </p>
      )}
    </div>
  );
}
