# Example Q&A — "Ask Hospilot"

These are real examples from the live system, showing the bar we're aiming for: correct
answers, grounded in real data, with the reasoning shown. (Note: the real system's SQL
uses its own internal table names, which won't exactly match `schema.sql` — that's fine,
you're building your own implementation with your own modeling choices, not replicating
this system's internals. What matters is the same bar: correct, grounded, reasoned.)

## Example 1: simple count

**Q:** How many ICU beds are available right now?

**Reasoning shown:**
```sql
SELECT COUNT(*) AS available_icu_beds
FROM bed
WHERE ward LIKE '%icu%' AND status = 'Available' AND is_active = 1
```

**A:** There are **6 ICU beds** available right now.

---

## Example 2: aggregation across tables (join + group by + ranking)

**Q:** Which wards have the highest bed occupancy right now?

**Reasoning shown:**
```sql
SELECT bed.ward, COUNT(*) AS occupied_beds,
       (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1) AS total_beds,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM bed b2 WHERE b2.ward = bed.ward AND b2.is_active = 1), 1) AS occupancy_percent
FROM bed
JOIN admission ON bed.id = admission.bed_id
WHERE bed.is_active = 1 AND admission.status != 'discharged'
GROUP BY bed.ward
ORDER BY occupancy_percent DESC
```

**A:** The **Semi-Private** ward has the highest bed occupancy at **50.0%**, with 3 out of
6 beds currently occupied.

The ranking of all wards by occupancy is:
1. Semi-Private: 50.0% (3/6 beds)
2. General Ward: 31.6% (6/19 beds)
3. ICU: 26.7% (8/30 beds)
4. Private: 25.0% (2/8 beds)

---

## Example 3: ambiguous phrasing (no specific ward/status named — system infers a broad, useful breakdown)

**Q:** how are beds doing?

**Reasoning shown:**
```sql
SELECT ward, status, COUNT(*) as count, room_type
FROM bed
WHERE is_active = 1
GROUP BY ward, status, room_type
ORDER BY ward, status
```

**A:** Here's the bed status across all active wards:

**Available:** 22 beds
**Occupied:** 40 beds
**Reserved:** 35 beds
**Dirty:** 4 beds

**By Ward:**
- **Cardiology:** 2 available, 2 occupied, 4 reserved
- **Emergency:** 4 available, 3 occupied, 6 reserved
- **General Ward:** 4 available, 6 occupied, 9 reserved
- **ICU:** 6 available, 17 occupied, 3 reserved, 4 dirty
- **Orthopedics:** 1 available, 1 occupied, 6 reserved
- **Pediatrics:** 2 available, 2 occupied, 4 reserved
- **Private Ward:** 2 available, 4 occupied, 2 reserved
- **Semi-Private Ward:** 1 available, 4 occupied, 1 reserved

Overall, the hospital has good availability with 22 beds open, though ICU is seeing
significant occupancy (17 of 26 beds occupied).

---

## Example 4: a question it correctly refuses (data not in the schema)

**Q:** What is our average patient satisfaction rating this month?

**A:** I don't have access to patient satisfaction rating data in the system. This metric
is not currently available in the database I can query.

To obtain this information, you may need to:
- Check your patient satisfaction survey platform or tool directly
- Contact your Quality/Patient Experience department
- Review your hospital's reporting dashboard if satisfaction metrics are tracked
  separately

Is there anything else related to bed availability or ward capacity I can help you with?
