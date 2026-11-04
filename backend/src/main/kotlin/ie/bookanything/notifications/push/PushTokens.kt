package ie.bookanything.notifications.push

import ie.bookanything.http.Errors

/** Expo push tokens, as the app gets them from `getExpoPushTokenAsync`. */
object PushTokens {
    const val MAX_LENGTH = 200

    /** `ExponentPushToken[…]` (or the newer `ExpoPushToken[…]`), printable ASCII inside the brackets. */
    private val FORMAT = Regex("""^Expo(nent)?PushToken\[[\x21-\x5C\x5E-\x7E]+]$""")

    fun isValid(token: String): Boolean = token.length <= MAX_LENGTH && FORMAT.matches(token)

    fun require(token: String): String =
        token.trim().takeIf(::isValid) ?: throw Errors.field("token", "Must be an Expo push token (ExponentPushToken[…])")
}
