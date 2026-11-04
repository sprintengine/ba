package ie.bookanything.storage

import java.io.ByteArrayOutputStream

/** PNG: chunk walk; drops text, time and EXIF chunks. */
internal object PngCodec : ImageCodec {
    private val DROP = setOf("tEXt", "zTXt", "iTXt", "eXIf", "tIME")

    override fun dimensions(bytes: ByteArray): Pair<Int, Int> {
        if (bytes.ascii(12, 4) != "IHDR" || bytes.u32be(8) != 13L) throw ImageSanitizer.corrupt()
        return bytes.u32be(16).toSideOrZero() to bytes.u32be(20).toSideOrZero()
    }

    override fun stripMetadata(bytes: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(bytes.size)
        out.write(bytes, 0, 8)
        var pos = 8
        while (true) {
            if (pos + 12 > bytes.size) throw ImageSanitizer.corrupt()
            val length = bytes.u32be(pos)
            val type = bytes.ascii(pos + 4, 4)
            val end = pos + 12 + length
            if (length > Int.MAX_VALUE || end > bytes.size) throw ImageSanitizer.corrupt()
            if (type !in DROP) out.write(bytes, pos, end.toInt() - pos)
            pos = end.toInt()
            if (type == "IEND") return out.toByteArray()
        }
    }
}

/** JPEG: segment walk; drops APP1–APP15 (EXIF, XMP, …) except APP2 ICC profiles, and comments. Keeps APP0 (JFIF). */
internal object JpegCodec : ImageCodec {
    private const val SOS = 0xDA
    private const val EOI = 0xD9
    private val SOF = (0xC0..0xCF).toSet() - setOf(0xC4, 0xC8, 0xCC)
    private val ICC = "ICC_PROFILE\u0000".toByteArray(Charsets.US_ASCII)

    override fun dimensions(bytes: ByteArray): Pair<Int, Int> {
        var result: Pair<Int, Int>? = null
        walk(bytes) { marker, start, end ->
            if (result == null && marker in SOF && end - start >= 9) result = bytes.u16be(start + 7) to bytes.u16be(start + 5)
            true
        }
        return result ?: throw ImageSanitizer.corrupt()
    }

    override fun stripMetadata(bytes: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(bytes.size)
        walk(bytes) { marker, start, end ->
            val drop = marker == 0xFE || (marker in 0xE1..0xEF && !(marker == 0xE2 && isIcc(bytes, start + 4, end)))
            if (!drop) out.write(bytes, start, end - start)
            true
        }
        return out.toByteArray()
    }

    private fun isIcc(bytes: ByteArray, from: Int, end: Int) = end - from >= ICC.size && ICC.indices.all { bytes[from + it] == ICC[it] }

    /**
     * Calls [visit] with (marker, start, end) for SOI, every segment, entropy-coded scan data (marker -1)
     * and EOI, covering the file from the start through EOI. Throws when the structure is broken.
     */
    private fun walk(bytes: ByteArray, visit: (marker: Int, start: Int, end: Int) -> Boolean) {
        visit(0xD8, 0, 2)
        var pos = 2
        while (pos < bytes.size) {
            if (bytes.u8(pos) != 0xFF) throw ImageSanitizer.corrupt()
            val p = afterFill(bytes, pos + 1)
            if (p >= bytes.size) break
            val marker = bytes.u8(p)
            if (marker == EOI) {
                visit(marker, p - 1, p + 1)
                return
            }
            pos = if (marker in 0xD0..0xD7 || marker == 0x01) { // Standalone markers (restart, TEM) have no length.
                visit(marker, p - 1, p + 1)
                p + 1
            } else {
                segment(bytes, p, visit)
            }
        }
        throw ImageSanitizer.corrupt()
    }

    /** The first position from [from] that is not a fill byte (0xFF). */
    private fun afterFill(bytes: ByteArray, from: Int): Int {
        var p = from
        while (p < bytes.size && bytes.u8(p) == 0xFF) p++
        return p
    }

    /**
     * Visits the segment whose marker is at [p] (its length follows the marker) and, after a start of scan, the
     * entropy-coded data. Returns where the next marker starts.
     */
    private fun segment(bytes: ByteArray, p: Int, visit: (marker: Int, start: Int, end: Int) -> Boolean): Int {
        if (p + 3 > bytes.size) throw ImageSanitizer.corrupt()
        val end = p + 1 + bytes.u16be(p + 1)
        if (end > bytes.size || end < p + 3) throw ImageSanitizer.corrupt()
        val marker = bytes.u8(p)
        visit(marker, p - 1, end)
        return if (marker == SOS) scanEnd(bytes, end).also { visit(-1, end, it) } else end
    }

    /** End of entropy-coded data: the next marker that is not stuffing (FF00), a restart (FFD0–D7) or fill. */
    private fun scanEnd(bytes: ByteArray, from: Int): Int {
        var i = from
        while (i + 1 < bytes.size) {
            if (bytes.u8(i) == 0xFF) {
                val next = bytes.u8(i + 1)
                if (next != 0x00 && next !in 0xD0..0xD7 && next != 0xFF) return i
                if (next == 0xFF) { i++; continue }
            }
            i++
        }
        throw ImageSanitizer.corrupt()
    }
}

/** WebP (RIFF): drops EXIF and XMP chunks, clears their VP8X flags and fixes the RIFF size. */
internal object WebpCodec : ImageCodec {
    private const val FLAG_EXIF = 0x08
    private const val FLAG_XMP = 0x04

    private data class Chunk(val fourcc: String, val start: Int, val dataStart: Int, val size: Int, val end: Int)

    private fun chunks(bytes: ByteArray): List<Chunk> {
        val riffEnd = 8 + bytes.u32le(4)
        if (riffEnd > bytes.size || riffEnd < 12) throw ImageSanitizer.corrupt()
        val out = ArrayList<Chunk>()
        var pos = 12
        while (pos + 8 <= riffEnd) {
            val size = bytes.u32le(pos + 4)
            val end = pos + 8 + size + (size and 1)
            if (end > riffEnd + (size and 1)) throw ImageSanitizer.corrupt()
            out += Chunk(bytes.ascii(pos, 4), pos, pos + 8, size.toInt(), minOf(end, riffEnd).toInt())
            pos = end.toInt()
        }
        if (out.isEmpty()) throw ImageSanitizer.corrupt()
        return out
    }

    override fun dimensions(bytes: ByteArray): Pair<Int, Int> {
        val all = chunks(bytes)
        val first = all.first()
        val d = first.dataStart
        return when (first.fourcc) {
            "VP8X" -> (bytes.u24le(d + 4) + 1) to (bytes.u24le(d + 7) + 1)
            "VP8L" -> {
                if (bytes.u8(d) != 0x2F) throw ImageSanitizer.corrupt()
                val bits = bytes.u32le(d + 1)
                ((bits and 0x3FFF) + 1).toInt() to (((bits shr 14) and 0x3FFF) + 1).toInt()
            }
            "VP8 " -> {
                if (!(bytes.u8(d + 3) == 0x9D && bytes.u8(d + 4) == 0x01 && bytes.u8(d + 5) == 0x2A)) throw ImageSanitizer.corrupt()
                (bytes.u16le(d + 6) and 0x3FFF) to (bytes.u16le(d + 8) and 0x3FFF)
            }
            else -> throw ImageSanitizer.corrupt()
        }.also {
            if (all.none { c -> c.fourcc == "VP8 " || c.fourcc == "VP8L" || c.fourcc == "ANMF" }) throw ImageSanitizer.corrupt()
        }
    }

    override fun stripMetadata(bytes: ByteArray): ByteArray {
        val body = ByteArrayOutputStream(bytes.size)
        for (c in chunks(bytes)) {
            if (c.fourcc == "EXIF" || c.fourcc == "XMP ") continue
            val copy = bytes.copyOfRange(c.start, c.end)
            if (c.fourcc == "VP8X") copy[8] = (copy[8].toInt() and (FLAG_EXIF or FLAG_XMP).inv()).toByte()
            body.write(copy)
        }
        val chunkBytes = body.toByteArray()
        val size = chunkBytes.size + 4
        val header = byteArrayOf(
            'R'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 'F'.code.toByte(),
            size.toByte(), (size shr 8).toByte(), (size shr 16).toByte(), (size shr 24).toByte(),
            'W'.code.toByte(), 'E'.code.toByte(), 'B'.code.toByte(), 'P'.code.toByte(),
        )
        return header + chunkBytes
    }
}

private fun Long.toSideOrZero(): Int = if (this in 1..Int.MAX_VALUE.toLong()) toInt() else 0
