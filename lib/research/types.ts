import { z } from "zod";

export const LICENSE_STATUS_VALUES = [
  "OPEN_LICENSE",
  "PUBLIC_DOMAIN",
  "OPEN_ACCESS",
  "LICENSE_UNCLEAR",
  "COPYRIGHTED",
  "NOT_RECOMMENDED",
] as const;

export const RESOURCE_TYPE_VALUES = [
  "article",
  "pdf",
  "course_material",
  "study_guide",
  "practice_questions",
] as const;

export const SUBJECT_SLUGS = [
  "assessment-of-learning",
  "child-and-adolescent-development",
  "principles-of-teaching",
  "curriculum-development",
  "educational-technology",
  "teaching-profession",
  "facilitating-learning",
  "general-education",
  "english",
  "mathematics",
  "science",
  "filipino",
  "social-studies",
] as const;

export const ResearchedResourceSchema = z.object({
  title: z.string().min(1),
  author: z.string().nullable(),
  source: z.string().min(1),
  original_url: z.string().url(),
  description: z.string().min(1),
  resource_type: z.enum(RESOURCE_TYPE_VALUES),
  license: z.string().nullable(),
  license_status: z.enum(LICENSE_STATUS_VALUES),
  license_evidence: z.string().min(1),
  subject_slug: z.enum(SUBJECT_SLUGS),
  topics: z.array(z.string().min(1)).min(1).max(4),
});

export const ResearchResponseSchema = z.object({
  resources: z.array(ResearchedResourceSchema),
});

export type ResearchedResource = z.infer<typeof ResearchedResourceSchema>;
