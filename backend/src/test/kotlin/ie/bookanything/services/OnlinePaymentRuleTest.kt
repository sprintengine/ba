package ie.bookanything.services

import ie.bookanything.support.TestEnv
import ie.bookanything.support.createBusiness
import ie.bookanything.support.testBusiness
import ie.bookanything.support.withApp
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/** [ServiceDef.needsOnlinePayment] and its SQL twin [ServiceRepository.anyNeedsOnlinePayment] agree. */
class OnlinePaymentRuleTest {
    @Test
    fun `a full-payment service priced only by its options is paid online, in Kotlin and in SQL`() {
        val env = TestEnv()
        withApp(env) { api ->
            val byOption = api.createBusiness(
                testBusiness("Priced by option") {
                    val ana = person("Ana")
                    service("Cut", 30) {
                        price(0)
                        option("Long", 60, 5000)
                        needs("Stylist", ana)
                    }
                },
            )
            val byAddon = api.createBusiness(
                testBusiness("Priced by add-on") {
                    val ana = person("Ana")
                    service("Cut", 30) {
                        price(0)
                        addon("Wash", 10, 1500)
                        needs("Stylist", ana)
                    }
                },
            )
            val unpaid = api.createBusiness(
                testBusiness("Nothing online") {
                    val ana = person("Ana")
                    service("Chat", 30) { needs("Host", ana) }
                    service("At the venue", 30) {
                        atVenue(3000)
                        needs("Host", ana)
                    }
                    service("Free in full", 30) {
                        price(0)
                        option("Short", 15, 0)
                        needs("Host", ana)
                    }
                },
            )
            for ((clinic, expected) in listOf(byOption to true, byAddon to true, unpaid to false)) {
                val id = UUID.fromString(clinic.id)
                env.db.txBlocking(id) { conn ->
                    val kotlin = ServiceRepository.list(conn, id).any { it.isActive && it.toDef().needsOnlinePayment }
                    assertEquals(expected, kotlin, "Kotlin rule for ${clinic.slug}")
                    assertEquals(expected, ServiceRepository.anyNeedsOnlinePayment(conn, id), "SQL rule for ${clinic.slug}")
                }
            }
        }
    }
}
