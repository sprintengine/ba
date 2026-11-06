import { Banknote, Clock, Lock, ShieldCheck, Stethoscope, Users } from "lucide-react";
import type { IndustryContent } from "./types";

export const GP_PRACTICE: IndustryContent = {
  slug: "gp-practice",
  templateKey: "gp_practice",
  icon: Stethoscope,
  color: "#15803d",
  templateLabel: "GP practice",
  business: {
    name: "Meadowbrook Family Practice",
    slug: "meadowbrook-practice",
    tagline: "Family GP practice and nurse clinic",
    logoUrl: "/logos/meadowbrook-practice.webp",
  },
  vocabulary: {
    resource: "Clinician",
    resources: "Clinicians",
    customer: "Patient",
    customers: "Patients",
    booking: "Appointment",
  },
  meta: {
    title: "Online appointment booking for GP practices",
    description:
      "Private and GMS / medical card patients, doctor and nurse appointments, payment at the practice and private reasons for visit. Free to start, 0% platform fee.",
  },
  hero: {
    eyebrow: "For GP practices",
    title: "Online booking, with separate windows for medical card patients.",
    description:
      "Private and GMS / medical card patients each see the right appointment windows. Patients book a doctor or the practice nurse online and pay at the practice. Reasons for visit stay private to your clinical team.",
    points: [
      "Patient groups with their own appointment windows",
      "Pay at the practice, or online if you prefer",
      "Reason for visit visible to staff only",
    ],
  },
  services: [
    {
      name: "GP consultation",
      description: "A standard consultation with a GP for a single issue.",
      durationMinutes: 15,
      priceCents: 6000,
      paymentMode: "at_venue",
    },
    {
      name: "Nurse appointment",
      description: "Vaccinations, dressings, blood pressure checks and general nurse care.",
      durationMinutes: 15,
      priceCents: 3000,
      paymentMode: "at_venue",
    },
    {
      name: "Blood test",
      description: "Blood sample taken by the practice nurse.",
      durationMinutes: 10,
      priceCents: 2500,
      paymentMode: "at_venue",
    },
    {
      name: "Smear test",
      description: "Cervical screening with the practice nurse. Free for eligible patients.",
      durationMinutes: 20,
      priceCents: 0,
      paymentMode: "at_venue",
    },
  ],
  features: [
    {
      icon: Users,
      title: "Private and GMS patients",
      body: "Patients say which group they're in. Medical card holders only see the windows you've reserved for them; private patients see the rest.",
    },
    {
      icon: Banknote,
      title: "Pay at the practice",
      body: "Appointments are paid at reception by default. Switch any service to deposits or online payment whenever you like.",
    },
    {
      icon: Lock,
      title: "Reason for visit stays private",
      body: "An optional, sensitive question: visible to practice staff only, never included in emails and never sent to AI.",
    },
    {
      icon: Stethoscope,
      title: "Doctors and the practice nurse",
      body: "GP consultations with a doctor of the patient's choice; bloods, smears and vaccinations with the nurse.",
    },
    {
      icon: Clock,
      title: "Ten and fifteen-minute slots",
      body: "Short appointments with tight intervals and a minimum notice period, so the day fills without gaps.",
    },
    {
      icon: ShieldCheck,
      title: "Staff logins and an audit trail",
      body: "Each clinician sees their own list; admins see everything. Every change is recorded, with who made it.",
    },
  ],
  preview: {
    groups: [
      { label: "Private patient", hint: "Standard consultation fee" },
      { label: "GMS / medical card", hint: "Reserved appointment times" },
    ],
    serviceIndex: 0,
    serviceIndexes: [0, 1, 2],
    resourceLabel: "Doctor",
    resourceChoices: ["Any doctor", "Dr Alex Morgan", "Dr Casey Lane"],
    slots: ["09:15", "09:45", "10:30", "11:00", "14:15", "16:45"],
    questions: [
      {
        label: "Reason for visit",
        kind: "textarea",
        placeholder: "A brief note helps the doctor prepare",
        help: "Only practice staff can see this.",
        sensitive: true,
        optional: true,
      },
    ],
    paymentNote: "Pay at the practice. Cancel online up to 4 hours before.",
  },
};
