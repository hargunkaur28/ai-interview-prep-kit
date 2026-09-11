import { Schema, model, Document, Types } from 'mongoose';
import { InternalKit } from '@trao/shared';

export interface IKitDocument extends Document, Omit<InternalKit, '_id' | 'userId'> {
  userId: Types.ObjectId;
}

const requirementSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: ['technical', 'behavioural', 'domain'], required: true },
    priority: { type: String, enum: ['must', 'nice'], required: true },
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    requirement_ids: [{ type: String }],
    category: {
      type: String,
      enum: ['technical', 'behavioural', 'system-design', 'company-fit'],
      required: true,
    },
    prompt: { type: String, required: true },
    answer_outline: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 3, required: true },
    origin: { type: String, enum: ['generated', 'user_added'], default: 'generated' },
    is_edited: { type: Boolean, default: false },
    is_pinned: { type: Boolean, default: false },
  },
  { _id: false }
);

const flashcardSchema = new Schema(
  {
    id: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, required: true },
    requirement_ids: [{ type: String }],
    origin: { type: String, enum: ['generated', 'user_added'], default: 'generated' },
    is_edited: { type: Boolean, default: false },
    is_pinned: { type: Boolean, default: false },
    confidence: { type: Number, min: 1, max: 3 },
    last_practiced_at: { type: String },
    practice_count: { type: Number, default: 0 },
  },
  { _id: false }
);

const scheduleDaySchema = new Schema(
  {
    day: { type: Number, required: true },
    focus: { type: String, required: true },
    question_ids: [{ type: String }],
    minutes: { type: Number, required: true },
  },
  { _id: false }
);

const kitSchema = new Schema<IKitDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: {
      company: { type: String, default: '' },
      company_url: { type: String, default: '' },
      role: { type: String, default: '' },
      location: { type: String, default: '' },
      jd_chars: { type: Number, default: 0 },
      researched_at: { type: String, default: () => new Date().toISOString() },
      pages_used: [{ type: String }],
    },
    company_brief: {
      summary: { type: String, default: '' },
      what_they_do: { type: String, default: '' },
      sources: [{ type: String }],
    },
    role: {
      title: { type: String, default: '' },
      seniority: { type: String, default: '' },
      responsibilities: [{ type: String }],
      requirements: [requirementSchema],
    },
    questions: [questionSchema],
    flashcards: [flashcardSchema],
    schedule: {
      days_available: { type: Number, default: 5 },
      days: [scheduleDaySchema],
    },
    coverage: {
      uncovered_requirement_ids: [{ type: String }],
      passes: { type: Number, default: 1 },
    },
    schedule_completed_days: [{ type: Number }],
  },
  { timestamps: true }
);

export const Kit = model<IKitDocument>('Kit', kitSchema);
