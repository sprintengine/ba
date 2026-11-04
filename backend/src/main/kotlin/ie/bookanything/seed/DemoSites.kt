package ie.bookanything.seed

import ie.bookanything.site.AboutContent
import ie.bookanything.site.ContactContent
import ie.bookanything.site.CtaContent
import ie.bookanything.site.FaqContent
import ie.bookanything.site.FaqItem
import ie.bookanything.site.GeneratedPattern
import ie.bookanything.site.HeroContent
import ie.bookanything.site.HeroVariant
import ie.bookanything.site.HoursContent
import ie.bookanything.site.SectionContent
import ie.bookanything.site.ServicesContent
import ie.bookanything.site.SiteImage
import ie.bookanything.site.SiteInputs
import ie.bookanything.site.SitePalette
import ie.bookanything.site.SitePlan
import ie.bookanything.site.SiteSection
import ie.bookanything.site.SiteSeo
import ie.bookanything.site.SiteTheme
import ie.bookanything.site.TeamContent
import ie.bookanything.site.TeamMember
import ie.bookanything.site.Testimonial
import ie.bookanything.site.TestimonialsContent

/**
 * Hand-written, published sites for the four demo businesses: one per theme family, real service
 * and team ids, generated backgrounds only (no external assets), FAQ consistent with each
 * business's policies and clearly labelled sample testimonials. Everything is fictional.
 */
object DemoSites {
    fun plan(slug: String, inputs: SiteInputs): SitePlan? {
        val ids = Ids(inputs)
        return when (slug) {
            "lumen-physio" -> lumen(ids)
            "gleam-car-wash" -> gleam(ids)
            "cadence-music" -> cadence(ids)
            "meadowbrook-practice" -> meadowbrook(ids)
            else -> null
        }
    }

    /** Looks up the seeded services and people by name (fails loudly when the demo data changed). */
    private class Ids(private val inputs: SiteInputs) {
        fun service(name: String) = inputs.services.firstOrNull { it.name == name }?.id ?: error("demo service '$name' not found")
        fun person(name: String) = inputs.team.firstOrNull { it.name == name }?.id ?: error("demo person '$name' not found")
    }

    private fun sampleReview(quote: String) = Testimonial(quote, author = "Demo customer", detail = "Sample review")
    private fun section(id: String, content: SectionContent) = SiteSection(id, enabled = true, content = content)

    private fun lumen(ids: Ids) = SitePlan(
        theme = SiteTheme.CALM,
        palette = SitePalette("#0f766e", "#9a6b3f"),
        seo = SiteSeo(
            "Lumen Physiotherapy | Physiotherapy in Dublin",
            "One-to-one physiotherapy and sports massage at Lantern Quay, Dublin. Book online and choose your therapist.",
        ),
        sections = listOf(
            section(
                "hero",
                HeroContent(
                    variant = HeroVariant.SPLIT, eyebrow = "Physiotherapy in Dublin", headline = "Move comfortably again",
                    subheadline = "Assessments, hands-on treatment and sports massage at Lantern Quay. Book online and choose the " +
                        "therapist you'd like to see.",
                    ctaLabel = "Book an appointment", image = SiteImage.generated(GeneratedPattern.WAVES),
                ),
            ),
            section(
                "services",
                ServicesContent(
                    heading = "Treatments", intro = "Every visit is one-to-one with a physiotherapist in a private treatment room.",
                    serviceIds = listOf(
                        ids.service("Initial assessment"), ids.service("Follow-up treatment"),
                        ids.service("Sports massage"),
                    ),
                ),
            ),
            section(
                "team",
                TeamContent(
                    heading = "Your therapists", intro = "Choose who you'd like to see when you book, or leave it to us.",
                    members = listOf(
                        TeamMember(
                            ids.person("Sam Rivers"),
                            "Sam works with runners and weekend athletes, with a focus on knee and ankle rehab and getting you back to " +
                                "the activities you enjoy.",
                        ),
                        TeamMember(
                            ids.person("Casey Lane"),
                            "Casey combines physiotherapy with sports massage and works late on weekdays, which suits anyone training " +
                                "after work.",
                        ),
                    ),
                ),
            ),
            section(
                "about",
                AboutContent(
                    heading = "About Lumen",
                    body = "Lumen is a small, calm clinic where every appointment is one-to-one. We start by listening, explain what we " +
                        "find in plain language and agree a plan that fits your week.\n\nBetween visits you'll have simple exercises to " +
                        "keep things moving.",
                    highlights = listOf(
                        "One-to-one appointments", "Choose your therapist", "Evening appointments Tuesday to Friday",
                        "Reschedule or cancel online",
                    ),
                    image = SiteImage.generated(GeneratedPattern.WAVES),
                ),
            ),
            section(
                "testimonials",
                TestimonialsContent(
                    heading = "What clients say",
                    items = listOf(
                        sampleReview(
                            "Booking took a minute and my therapist explained everything clearly. I left with exercises I actually do.",
                        ),
                        sampleReview("Being able to pick an evening slot online made it easy to fit around work."),
                        sampleReview("A quiet, welcoming clinic. I always know what we're working on next."),
                    ),
                ),
            ),
            section(
                "faq",
                FaqContent(
                    heading = "Good to know",
                    items = listOf(
                        FaqItem(
                            "What happens at my first visit?",
                            "Your first appointment is an initial assessment: we talk through what's bothering you, look at how you move " +
                                "and agree a treatment plan together.",
                        ),
                        FaqItem("Can I choose my therapist?", "Yes. Pick Sam or Casey when you book, or choose any available therapist."),
                        FaqItem("When do I pay?", "You pay online when you book."),
                        FaqItem(
                            "Can I change or cancel my appointment?",
                            "Yes. Use the link in your confirmation email. Changes can be made up to 24 hours before your appointment. " +
                                "If you cancel at least 24 hours before, you get a full refund; later cancellations get a 50% refund.",
                        ),
                        FaqItem(
                            "What should I wear?",
                            "Comfortable clothes that let you move freely, such as shorts or leggings and a t-shirt.",
                        ),
                    ),
                ),
            ),
            section("hours", HoursContent(heading = "Opening hours", note = "Evening appointments are available Tuesday to Friday.")),
            section(
                "cta",
                CtaContent(
                    headline = "Ready when you are", body = "Book your initial assessment online in a couple of minutes.",
                    buttonLabel = "Book an appointment",
                ),
            ),
            section(
                "contact",
                ContactContent(
                    heading = "Find us",
                    body = "Questions before you book? Call or email the clinic and we'll be happy to help.",
                ),
            ),
        ),
    )

    private fun gleam(ids: Ids) = SitePlan(
        theme = SiteTheme.BOLD,
        palette = SitePalette("#0369a1", "#c2410c"),
        seo = SiteSeo(
            "Gleam Car Wash | Car wash and valeting in Cork",
            "Hand washes and full valets at Orchard Business Park, Cork. Book a bay online and drive straight in.",
        ),
        sections = listOf(
            section(
                "hero",
                HeroContent(
                    variant = HeroVariant.COVER, eyebrow = "Car wash and valeting in Cork", headline = "Showroom shine, booked in seconds",
                    subheadline = "Choose an exterior wash or a full valet, pick a time and drive straight into your bay.",
                    ctaLabel = "Book a wash", image = SiteImage.generated(GeneratedPattern.RAYS),
                ),
            ),
            section(
                "services",
                ServicesContent(
                    heading = "Washes and valets",
                    intro = "Full valets are priced by vehicle size. Add wax or an interior shampoo when you book.",
                    serviceIds = listOf(ids.service("Exterior wash"), ids.service("Full valet")),
                ),
            ),
            section(
                "about",
                AboutContent(
                    heading = "About Gleam",
                    body = "Gleam is a hand car wash with two covered bays at Orchard Business Park. Book a time online, drive in, and " +
                        "we'll take it from there.",
                    highlights = listOf("Two covered wash bays", "Room for vans and SUVs", "Reschedule or cancel online"),
                    image = SiteImage.generated(GeneratedPattern.RAYS),
                ),
            ),
            section(
                "testimonials",
                TestimonialsContent(
                    heading = "What drivers say",
                    items = listOf(
                        sampleReview("Booked on my phone at lunch and the car was ready when I came back. Spotless."),
                        sampleReview("Handy to add the interior shampoo while booking. The seats look new."),
                    ),
                ),
            ),
            section(
                "faq",
                FaqContent(
                    heading = "Questions",
                    items = listOf(
                        FaqItem(
                            "How long does a full valet take?",
                            "From 90 minutes for a small car to 150 minutes for an SUV or van, plus any extras you add.",
                        ),
                        FaqItem(
                            "How does payment work?",
                            "Exterior washes are paid online when you book. Full valets need a deposit online and the rest is paid when " +
                                "you collect your car.",
                        ),
                        FaqItem(
                            "Can I change or cancel my booking?",
                            "Yes, from the link in your confirmation email. Changes can be made up to 12 hours before. Cancellations at " +
                                "least 12 hours before are refunded in full; later cancellations are not refunded.",
                        ),
                        FaqItem(
                            "What do I need to bring?",
                            "Just your car. We ask for the registration when you book so we can find you when you arrive.",
                        ),
                    ),
                ),
            ),
            section("hours", HoursContent(heading = "Opening hours")),
            section(
                "cta",
                CtaContent(
                    headline = "Your car, only cleaner", body = "Pick a wash and a time that suits you.",
                    buttonLabel = "Book a wash",
                ),
            ),
            section("contact", ContactContent(heading = "Get in touch", body = "Questions about a big job or a fleet? Call or email us.")),
        ),
    )

    private fun cadence(ids: Ids) = SitePlan(
        theme = SiteTheme.PLAYFUL,
        palette = SitePalette("#7c3aed", "#db2777"),
        seo = SiteSeo(
            "Cadence Music Studio | Music lessons in Galway",
            "One-to-one piano, voice, guitar, drums and violin lessons in Galway. New students start with a free trial lesson.",
        ),
        sections = listOf(
            section(
                "hero",
                HeroContent(
                    variant = HeroVariant.SPLIT, eyebrow = "Music lessons in Galway", headline = "Find your rhythm",
                    subheadline = "One-to-one lessons for every age and level. New here? Start with a free trial lesson.",
                    ctaLabel = "Book a lesson", image = SiteImage.generated(GeneratedPattern.DOTS),
                ),
            ),
            section(
                "services",
                ServicesContent(
                    heading = "Lessons", intro = "Lessons run for 30, 45 or 60 minutes. Choose the length that suits you.",
                    serviceIds = listOf(ids.service("Trial lesson"), ids.service("Lesson")),
                ),
            ),
            section(
                "team",
                TeamContent(
                    heading = "Meet your teachers", intro = "Pick a teacher when you book.",
                    members = listOf(
                        TeamMember(
                            ids.person("Jordan Casey"),
                            "Jordan teaches piano and voice and loves helping nervous beginners find their confidence.",
                        ),
                        TeamMember(
                            ids.person("Taylor Quinn"),
                            "Taylor teaches guitar, drums and violin, and happily switches between rock, folk and trad.",
                        ),
                    ),
                ),
            ),
            section(
                "about",
                AboutContent(
                    heading = "About Cadence",
                    body = "Cadence is a friendly studio on Tuning Fork Lane with a soundproofed practice room, an upright piano and " +
                        "amps ready to go.\n\nLessons follow what you want to play, from your first notes to exam pieces.",
                    highlights = listOf(
                        "Free trial lesson for new students", "Piano, voice, guitar, drums and violin",
                        "Choose your teacher",
                    ),
                    image = SiteImage.generated(GeneratedPattern.DOTS),
                ),
            ),
            section(
                "testimonials",
                TestimonialsContent(
                    heading = "What students say",
                    items = listOf(
                        sampleReview("The trial lesson was relaxed and fun, and we signed up for weekly lessons straight after."),
                        sampleReview("My daughter looks forward to guitar every week."),
                        sampleReview("Booking and moving lessons online is so easy."),
                    ),
                ),
            ),
            section(
                "faq",
                FaqContent(
                    heading = "Questions",
                    items = listOf(
                        FaqItem(
                            "Is the trial lesson free?",
                            "Yes. New students can book a free 30-minute trial lesson; there's nothing to pay when you book it.",
                        ),
                        FaqItem("Which instruments do you teach?", "Piano, voice, guitar, drums and violin."),
                        FaqItem("How do I pay for lessons?", "Lessons are paid online when you book."),
                        FaqItem(
                            "Can I change or cancel a lesson?",
                            "Yes, from the link in your confirmation email. Changes can be made up to 24 hours before. Cancellations at " +
                                "least 24 hours before are refunded in full; later cancellations are not refunded.",
                        ),
                    ),
                ),
            ),
            section(
                "hours",
                HoursContent(heading = "Lesson times", note = "Lessons run on weekday afternoons and evenings and on Saturday mornings."),
            ),
            section(
                "cta",
                CtaContent(
                    headline = "Ready to play?", body = "Book a free trial lesson and meet your teacher.",
                    buttonLabel = "Book a lesson",
                ),
            ),
            section("contact", ContactContent(heading = "Say hello", body = "Not sure which lesson length suits you? Get in touch.")),
        ),
    )

    private fun meadowbrook(ids: Ids) = SitePlan(
        theme = SiteTheme.CLINICAL,
        palette = SitePalette("#15803d", null),
        seo = SiteSeo(
            "Meadowbrook Family Practice | GP practice in Dublin",
            "Book GP, nurse and blood test appointments online with Meadowbrook Family Practice in Dublin.",
        ),
        sections = listOf(
            section(
                "hero",
                HeroContent(
                    variant = HeroVariant.SPLIT, eyebrow = "GP practice in Dublin", headline = "Family healthcare, close to home",
                    subheadline = "Book GP, nurse and blood test appointments online at a time that suits you.",
                    ctaLabel = "Book an appointment", image = SiteImage.generated(GeneratedPattern.GRID),
                ),
            ),
            section(
                "services",
                ServicesContent(
                    heading = "Appointments", intro = "Choose the type of appointment you need. Payment is taken at the practice.",
                    serviceIds = listOf(
                        ids.service("GP consultation"), ids.service("Nurse appointment"), ids.service("Blood test"),
                        ids.service("Smear test"),
                    ),
                ),
            ),
            section(
                "team",
                TeamContent(
                    heading = "Our clinicians",
                    members = listOf(
                        TeamMember(
                            ids.person("Dr Alex Morgan"),
                            "Alex looks after patients of all ages, with a particular interest in women's health and family medicine.",
                        ),
                        TeamMember(
                            ids.person("Dr Casey Lane"),
                            "Casey has a particular interest in sports medicine and in helping patients manage long-term conditions.",
                        ),
                        TeamMember(
                            ids.person("Morgan Reid"),
                            "Morgan runs the nurse clinics: blood tests, cervical screening, vaccinations and wound care.",
                        ),
                    ),
                ),
            ),
            section(
                "about",
                AboutContent(
                    heading = "About the practice",
                    body = "Meadowbrook Family Practice cares for individuals and families from Meadowbrook Green and the surrounding " +
                        "area.\n\nBook routine appointments online at any time, or call reception if you're not sure which appointment " +
                        "you need.",
                    highlights = listOf(
                        "GP and nurse appointments", "Times set aside for medical card holders",
                        "Reschedule or cancel online",
                    ),
                    image = SiteImage.generated(GeneratedPattern.GRID),
                ),
            ),
            section(
                "testimonials",
                TestimonialsContent(
                    heading = "What patients say",
                    items = listOf(
                        sampleReview("Booking a blood test online was quick, and the reminder email was handy."),
                        sampleReview("Friendly reception and easy to find an appointment that suits."),
                    ),
                ),
            ),
            section(
                "faq",
                FaqContent(
                    heading = "Frequently asked questions",
                    items = listOf(
                        FaqItem("Do I pay when I book?", "No. You pay at the practice; nothing is charged when you book online."),
                        FaqItem(
                            "I have a medical card. Can I book online?",
                            "Yes. Choose \"GMS / medical card holder\" when you book to see the appointment times set aside for card " +
                                "holders.",
                        ),
                        FaqItem(
                            "Can I change or cancel my appointment?",
                            "Yes, from the link in your confirmation email, up to 4 hours before your appointment. Please let us know if " +
                                "you can't make it so someone else can use the time.",
                        ),
                        FaqItem(
                            "What if I need urgent care?",
                            "Online booking is for routine appointments. In an emergency, call 112 or 999.",
                        ),
                    ),
                ),
            ),
            section("hours", HoursContent(heading = "Opening hours")),
            section(
                "cta",
                CtaContent(
                    headline = "Book your next appointment online", body = "Choose a GP, nurse or blood test appointment.",
                    buttonLabel = "Book an appointment",
                ),
            ),
            section(
                "contact",
                ContactContent(
                    heading = "Contact the practice",
                    body = "For anything that can't be booked online, call reception during opening hours.",
                ),
            ),
        ),
    )
}
