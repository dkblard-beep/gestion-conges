package com.aistudio.suiviconges.model

import kotlinx.serialization.Serializable
import java.time.LocalDate

@Serializable
data class Absence(
    val id: Long = System.currentTimeMillis(),
    val type: String, // "CP" or "RTT"
    val date: String, // "YYYY-MM-DD"
    val duree: Double // 0.5 to 365
)

enum class AbsenceType(val label: String) {
    CP("CP"),
    RTT("RTT")
}

object DatePeriodUtils {
    /**
     * French CP period runs from June 1st of year Y to May 31st of year Y+1.
     * If date month is before June (Jan-May), it belongs to period year - 1.
     * Otherwise it belongs to year.
     */
    fun getCPPeriod(dateStr: String): String {
        return try {
            val date = LocalDate.parse(dateStr)
            if (date.monthValue < 6) {
                (date.year - 1).toString()
            } else {
                date.year.toString()
            }
        } catch (e: Exception) {
            LocalDate.now().year.toString()
        }
    }

    /**
     * RTT period is the calendar year (Jan 1 - Dec 31).
     */
    fun getRTTPeriod(dateStr: String): String {
        return try {
            val date = LocalDate.parse(dateStr)
            date.year.toString()
        } catch (e: Exception) {
            LocalDate.now().year.toString()
        }
    }

    /**
     * Format CP period label, e.g. "Juin 2026 - Mai 2027"
     */
    fun formatCPPeriod(yearStr: String): String {
        return try {
            val year = yearStr.toInt()
            "Juin $year - Mai ${year + 1}"
        } catch (e: Exception) {
            yearStr
        }
    }
}
