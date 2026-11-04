package ie.bookanything

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

/** Conventions the tools cannot see, checked over the source tree. */
class SourceRulesTest {
    private val sources = listOf(File("src/main/kotlin"), File("src/test/kotlin"))
        .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }

    /**
     * detekt analyses the sources without the serialization compiler plugin, so a call to a plugin-generated
     * companion `serializer()` is an unresolved reference to it, and every type that depends on it is unknown (about 200
     * analysis errors before this rule). The library's reified `serializer<Foo>()` resolves the same serializer (the
     * plugin inlines it).
     */
    @Test
    fun `serializers are looked up with serializer of T, not the generated companion`() {
        val builtIns = setOf("String", "Boolean", "Int", "Long", "Double", "JsonElement", "JsonObject", "JsonArray", "JsonPrimitive")
        val generated = Regex("""\b([A-Z][A-Za-z0-9_]*)\.serializer\(\)""")
        val offenders = sources.flatMap { file ->
            file.readLines().mapIndexedNotNull { i, line ->
                generated.findAll(line).map { it.groupValues[1] }.filter { it !in builtIns }.toList()
                    .takeIf { it.isNotEmpty() }?.let { "${file.path}:${i + 1}: ${it.joinToString()}.serializer()" }
            }
        }
        assertEquals(emptyList(), offenders, "Use serializer<T>() (kotlinx.serialization.serializer) instead")
    }
}
