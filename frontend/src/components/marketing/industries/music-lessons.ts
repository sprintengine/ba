import { Clock, CreditCard, DoorOpen, Gift, ListChecks, Music, Repeat } from "lucide-react";
import type { IndustryContent } from "./types";

export const MUSIC_LESSONS: IndustryContent = {
  slug: "music-lessons",
  templateKey: "music_lessons",
  icon: Music,
  color: "#7c3aed",
  templateLabel: "music lessons",
  business: {
    name: "Cadence Music Studio",
    slug: "cadence-music",
    tagline: "Piano, guitar, voice and more",
    logoUrl: "/logos/cadence-music.webp",
  },
  vocabulary: {
    resource: "Teacher",
    resources: "Teachers",
    customer: "Student",
    customers: "Students",
    booking: "Lesson",
  },
  meta: {
    title: "Online booking for music teachers and schools",
    description:
      "Free trial lessons for new students, 30, 45 or 60-minute lessons, instrument and level questions, and payment when booking. Free to start, 0% platform fee.",
  },
  hero: {
    eyebrow: "For music teachers and schools",
    title: "Fill your timetable, starting with a free trial.",
    description:
      "New students book a free 30-minute trial with the teacher they like. Regulars choose 30, 45 or 60-minute lessons and pay when they book. Instrument, level and age are asked upfront, so every lesson starts prepared.",
    points: [
      "Free trial lessons for new students only",
      "30, 45 or 60-minute lessons, priced to match",
      "Teacher and practice room booked together",
    ],
  },
  services: [
    {
      name: "Trial lesson",
      description: "A free taster lesson. Meet your teacher, try the instrument and talk about your goals.",
      durationMinutes: 30,
      priceCents: 0,
      paymentMode: "free",
      restriction: "New students only",
    },
    {
      name: "Lesson",
      description: "A one-to-one lesson tailored to your level, from first notes to exam preparation.",
      durationMinutes: 30,
      priceCents: 2500,
      paymentMode: "full",
      options: [
        { name: "30 minutes", durationMinutes: 30, priceCents: 2500 },
        { name: "45 minutes", durationMinutes: 45, priceCents: 3500 },
        { name: "60 minutes", durationMinutes: 60, priceCents: 4500 },
      ],
    },
  ],
  features: [
    {
      icon: Gift,
      title: "Free trials, for new students",
      body: "The trial lesson is only offered to new students, so regulars can't book free lessons by accident.",
    },
    {
      icon: Clock,
      title: "A price for each lesson length",
      body: "30, 45 or 60 minutes, each with its own price. Students pick the length and the timetable takes care of the rest.",
    },
    {
      icon: ListChecks,
      title: "Instrument, level and age",
      body: "Questions on the booking form mean you know it's a beginner on guitar, aged nine, before they walk in.",
    },
    {
      icon: DoorOpen,
      title: "Teacher and room together",
      body: "Lessons reserve a teacher and the practice room, so two teachers never end up sharing the piano.",
    },
    {
      icon: CreditCard,
      title: "Paid when booked",
      body: "Lessons are paid online at booking, straight to your own account. No more chasing cash at the door.",
    },
    {
      icon: Repeat,
      title: "Weekly recurring lessons",
      body: "Book the same slot every week for the whole term in one go.",
      comingSoon: true,
    },
  ],
  preview: {
    groups: [
      { label: "New student", hint: "Start with a free trial" },
      { label: "Existing student", hint: "Book your next lesson" },
    ],
    serviceIndex: 0,
    serviceIndexes: [0, 1],
    resourceLabel: "Teacher",
    resourceChoices: ["Any teacher", "Jordan Casey", "Taylor Quinn"],
    slots: ["15:00", "15:45", "16:30", "17:15", "18:00", "19:30"],
    questions: [
      {
        label: "Instrument",
        kind: "select",
        options: ["Piano", "Guitar", "Violin", "Voice", "Drums", "Other"],
      },
      {
        label: "Level",
        kind: "select",
        options: ["Complete beginner", "Beginner", "Intermediate", "Advanced"],
      },
    ],
    paymentNote: "Free trial, no card needed.",
  },
};
