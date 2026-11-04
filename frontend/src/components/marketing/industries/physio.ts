import { Activity, Bell, CreditCard, Layers, Lock, Timer, UserRound } from "lucide-react";
import type { IndustryContent } from "./types";

export const PHYSIO: IndustryContent = {
  slug: "physio",
  templateKey: "physio",
  icon: Activity,
  color: "#0f766e",
  templateLabel: "physio",
  business: {
    name: "Lumen Physiotherapy",
    slug: "lumen-physio",
    tagline: "Sports injuries, back pain and rehab",
    initials: "LP",
  },
  vocabulary: {
    resource: "Therapist",
    resources: "Therapists",
    customer: "Client",
    customers: "Clients",
    booking: "Appointment",
  },
  meta: {
    title: "Online booking for physiotherapy clinics",
    description:
      "Book the therapist and the treatment room together, take full prepayment through your own Stripe account and keep intake notes private. Free to start, 0% platform fee.",
  },
  hero: {
    eyebrow: "For physiotherapy clinics",
    title: "Book the therapist and the room in one go.",
    description:
      "Clients choose a treatment and a therapist (or whoever is free), pay upfront and tell you what's wrong in a private intake question. bookanything reserves a therapist and a treatment room together, so nobody is ever double-booked.",
    points: [
      "Therapist and treatment room reserved together",
      "Full prepayment to your own Stripe account",
      "Sensitive intake answers kept private",
    ],
  },
  services: [
    {
      name: "Initial assessment",
      description: "A full assessment of your injury or pain, a clear diagnosis and a treatment plan.",
      durationMinutes: 60,
      priceCents: 7000,
      paymentMode: "full",
    },
    {
      name: "Follow-up treatment",
      description: "Hands-on treatment and exercise progression for existing clients.",
      durationMinutes: 45,
      priceCents: 6000,
      paymentMode: "full",
    },
    {
      name: "Sports massage",
      description: "Deep tissue sports massage to aid recovery and reduce muscle tension.",
      durationMinutes: 30,
      priceCents: 4000,
      paymentMode: "full",
      options: [
        { name: "30 minutes", durationMinutes: 30, priceCents: 4000 },
        { name: "60 minutes", durationMinutes: 60, priceCents: 6500 },
      ],
    },
  ],
  features: [
    {
      icon: Layers,
      title: "Therapist and room, together",
      body: "Every appointment reserves a therapist and a free treatment room at the same moment. If either is taken, the slot simply isn't offered.",
    },
    {
      icon: UserRound,
      title: "Their therapist, or anyone free",
      body: "Clients can book the therapist they know, or pick “Any therapist” and see every open slot across your team.",
    },
    {
      icon: CreditCard,
      title: "Paid when booked",
      body: "Full prepayment by default, straight into your own Stripe account. Late cancellations follow your policy automatically.",
    },
    {
      icon: Lock,
      title: "Private intake questions",
      body: "“What would you like help with?” is marked sensitive: visible to your team, left out of emails and never sent to AI.",
    },
    {
      icon: Timer,
      title: "Time to write notes",
      body: "Buffers after each session give you ten minutes to write up and reset the room, built into availability.",
    },
    {
      icon: Bell,
      title: "Fewer no-shows",
      body: "Email reminders the day before, with a link to reschedule within your policy. SMS reminders at cost on paid plans.",
    },
  ],
  preview: {
    serviceIndex: 0,
    serviceIndexes: [0, 1, 2],
    resourceLabel: "Therapist",
    resourceChoices: ["Any therapist", "Sam Rivers", "Robin Ashby"],
    slots: ["09:00", "10:30", "11:30", "14:00", "15:30", "16:30"],
    questions: [
      {
        label: "What would you like help with?",
        kind: "textarea",
        placeholder: "For example: right knee pain when running",
        help: "Only your therapist will see this.",
        sensitive: true,
      },
    ],
    paymentNote: "Paid securely by card. Free cancellation up to 24 hours before.",
  },
};
