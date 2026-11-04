package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.SetupInstaller
import java.time.LocalTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DraftRepairTest {
    @Test
    fun `business settings fall back to the defaults`() {
        assertEquals("Europe/London", DraftRepair.timezone(" Europe/London "))
        listOf("UTC", "+01:00", "GMT", "Mars/Olympus", "").forEach { assertEquals("Europe/Dublin", DraftRepair.timezone(it), it) }
        assertEquals("GBP", DraftRepair.currency(" gbp"))
        listOf("EURO", "XYZ", "").forEach { assertEquals("EUR", DraftRepair.currency(it), it) }
        assertEquals("fr-FR", DraftRepair.locale("fr-FR"))
        assertEquals("en-IE", DraftRepair.locale("en_IE"))
        assertEquals("GB", DraftRepair.country("gb"))
        assertEquals("IE", DraftRepair.country("Ireland"))
        assertEquals("#0f766e", DraftRepair.color("#0F766E"))
        assertEquals(Branding.DEFAULT_PRIMARY_COLOR, DraftRepair.color("teal"))
    }

    @Test
    fun `payment settings follow the prices`() {
        fun pay(raw: String, price: Int = 5000, anyPrice: Boolean = true, deposit: Int = 0) =
            DraftRepair.payment(raw, price, anyPrice, deposit)
        assertEquals(DraftRepair.Payment("free", null), pay("full", price = 0, anyPrice = false))
        assertEquals(DraftRepair.Payment("at_venue", null), pay("free"))
        assertEquals(DraftRepair.Payment("full", null), pay("card"))
        assertEquals(DraftRepair.Payment("full", null), pay(""))
        assertEquals(DraftRepair.Payment("at_venue", null), pay(" AT_VENUE "))
        assertEquals(DraftRepair.Payment("deposit", 1000), pay("deposit", deposit = 1000))
        assertEquals(DraftRepair.Payment("deposit", 5000), pay("deposit", deposit = 5000))
        assertEquals(DraftRepair.Payment("full", null), pay("deposit", deposit = 6000), "a deposit above the price")
        assertEquals(DraftRepair.Payment("full", null), pay("deposit", deposit = -5), "no deposit")
    }

    @Test
    fun `values are cleaned, keyed and rounded`() {
        assertEquals("Hi\nthere", DraftRepair.text(" Hi\u0007\nthere ", 100))
        assertEquals("abc", DraftRepair.text("abcdef", 3))
        assertNull(DraftRepair.text(" \u0000 ", 10))
        assertNull(DraftRepair.text(null, 10))
        assertEquals("new_patients", DraftRepair.key("New Patients!", "x"))
        assertEquals("group_1", DraftRepair.key("???", "group_1"))
        assertEquals(listOf(0, 5, 5, 10), listOf(2, 3, 7, 8).map(DraftRepair::roundTo5))
        assertEquals(LocalTime.of(9, 30), DraftRepair.time(" 9:30"))
        assertEquals(LocalTime.of(23, 59), DraftRepair.time("24:00"))
        listOf("24:30", "9.30", "12:60", "noon").forEach { assertNull(DraftRepair.time(it), it) }
    }

    @Test
    fun `keys are unique and references resolve to them`() {
        val ai = AiSetup(
            name = "Studio", customerGroups = listOf(AiGroup("vip", "VIP"), AiGroup("", "Vip")),
            resources = listOf(
                AiResource("Room", "space", "Room A"), AiResource("", "space", "Room"),
                AiResource("t1", "person", "Therapist", weeklyHours = listOf(AiHours(1, "09:00", "17:00", listOf("VIP", "nope")))),
            ),
            services = listOf(
                AiService(
                    "Massage", durationMinutes = 61, priceCents = 4000,
                    requirements = listOf(AiRequirement(resourceKeys = listOf("ghost"))),
                ),
                AiService("massage", durationMinutes = 30),
                AiService(
                    "Sauna", allowedGroupKeys = listOf("vip_2"),
                    requirements = listOf(AiRequirement("Room", 5, true, listOf("room", "room_2"))),
                ),
            ),
            questions = listOf(AiQuestion("Allergies?", kind = "select", serviceName = "MASSAGE")),
        )
        val setup = DraftRepair.toSetup(ai, BusinessDraftRequest("A studio"))!!
        assertEquals(listOf("vip", "vip_2"), setup.customerGroups.map { it.key })
        assertEquals(listOf("room", "room_2", "t1"), setup.resources.map { it.key })
        assertEquals(listOf("vip"), setup.resources[2].weeklyHours.single().audienceGroupKeys)
        assertEquals(listOf("Massage", "Sauna"), setup.services.map { it.name }, "duplicate names are dropped")
        val massage = setup.services[0]
        assertEquals(60, massage.durationMinutes)
        assertEquals(SetupRequirement("Staff member", 1, false, listOf("t1")), massage.requirements.single(), "unknown pools: the people")
        val sauna = setup.services[1]
        assertEquals(SetupRequirement("Room", 2, true, listOf("room", "room_2")), sauna.requirements.single())
        assertEquals(listOf("vip_2"), sauna.allowedGroupKeys)
        assertEquals("free", sauna.paymentMode)
        assertEquals(SetupQuestion("Allergies?", kind = "text", serviceName = "Massage"), setup.questions.single())
    }

    @Test
    fun `every template and repaired hold passes settings validation`() {
        for (t in Templates.all) assertEquals(emptyMap(), SetupInstaller.validate(t.setup).errors(), t.key)
        // The schema, the prompt and the repair use one range, inside what settings accept.
        val suggested = Policies.SUGGESTED_HOLD_MINUTES
        assertTrue(suggested.first in Policies.HOLD_MINUTES && suggested.last in Policies.HOLD_MINUTES)
        assertEquals(
            listOf(suggested.first, 45, suggested.last),
            listOf(2, 45, 3000).map { DraftRepair.policies(AiPolicies(holdMinutes = it)).holdMinutes },
        )
        assertTrue("holdMinutes (${suggested.first}-${suggested.last} when paying online)" in DraftPrompt.SYSTEM)
        assertTrue("(${suggested.first}-${suggested.last})" in DraftSchema.schema.toString())
    }

    @Test
    fun `nothing bookable is no setup`() {
        assertNull(DraftRepair.toSetup(AiSetup(services = listOf(AiService("Massage"))), BusinessDraftRequest("x")))
        assertNull(DraftRepair.toSetup(AiSetup(resources = listOf(AiResource(name = "Room"))), BusinessDraftRequest("x")))
    }
}
