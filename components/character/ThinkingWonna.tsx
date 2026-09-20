import { TeacherWonna } from "@/components/character/TeacherWonna";

export function ThinkingWonna({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <TeacherWonna state="thinking" size="lg" />
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  );
}
