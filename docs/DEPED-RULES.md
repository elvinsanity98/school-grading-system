# DepEd rules implemented

Source: **DepEd Order No. 8, s. 2015**, *Policy Guidelines on Classroom Assessment for the K to 12 Basic Education
Program*, with the Senior High School weights it lists, as still used in later orders (for example DO 21, s. 2019);
honors follow **DO 36, s. 2016**. The rules live in `packages/core/src/grading.ts` and are covered by
`packages/core/tests/grading.test.ts` (the whole transmutation table is checked row by row).

> Check these against the latest DepEd issuance and your division's instructions before the school year starts. The
> weights are editable in the app; the transmutation table, rounding and honors formula are in code.

## From scores to a quarterly grade

For each learner, subject and quarter:

1. **Total Score** of a component = sum of the learner's scores; **Highest Possible Score (HPS)** = sum of the items' HPS.
   Excused items are left out of both. A blank score counts as 0 and is flagged; the record cannot be submitted with blanks.
2. **Percentage Score (PS)** = Total Score / HPS x 100, rounded to 2 decimals.
3. **Weighted Score (WS)** = PS x weight of the component, rounded to 2 decimals.
4. **Initial Grade** = WS(Written Work) + WS(Performance Tasks) + WS(Quarterly Assessment).
5. **Quarterly Grade** = transmuted Initial Grade.

Example (core subject, weights 25 / 50 / 25):

| Component | Score | HPS | PS | Weight | WS |
| --- | --- | --- | --- | --- | --- |
| Written Work | 40 | 50 | 80.00 | 25% | 20.00 |
| Performance Tasks | 90 | 100 | 90.00 | 50% | 45.00 |
| Quarterly Assessment | 45 | 60 | 75.00 | 25% | 18.75 |
| **Initial Grade** | | | | | **83.75** |

83.75 falls in the band 82.40 to 83.99, so the **Quarterly Grade is 89**.

Because PS and WS are rounded to 2 decimals at each step, the numbers on screen add up exactly the way a teacher
would check them on paper. The official DepEd Excel class record may differ by one point in rare edge cases where it
carries unrounded values; report any such difference so the rounding rule can be confirmed.

## Weights (Senior High School)

| Subjects | Written Work | Performance Tasks | Quarterly Assessment |
| --- | --- | --- | --- |
| Core subjects (all tracks) | 25% | 50% | 25% |
| Academic track: applied and specialized | 25% | 45% | 30% |
| Academic track: Work Immersion, Research, Business Enterprise Simulation, Exhibit, Performance | 35% | 40% | 25% |
| TVL, Sports, Arts and Design: applied and specialized (including Work Immersion) | 20% | 60% | 20% |

The right row is chosen from the subject type, its *immersion* flag and the track of the strand. A subject can also be
given a specific row by the administrator.

## Transmutation table

- Initial Grade **60.00 to 100** maps to **75 to 100**: one step for every 1.60 points (60.00-61.59 = 75, 61.60-63.19 = 76, ... 98.40-99.99 = 99, 100 = 100).
- Initial Grade **0 to 59.99** maps to **60 to 74**: one step for every 4.00 points (56.00-59.99 = 74, ... 0-3.99 = 60).

The full table is shown under Setup, System and backup.

## Semester, general average, remarks

- **Semester final grade** = average of the two quarterly grades of the semester (Q1 and Q2, or Q3 and Q4), rounded half up to a whole number. Both quarters must be approved.
- **General average** = average of the final grades of all subjects of the semester, each subject counting equally, rounded half up.
- **Passing grade 75.** Below 75 is *Failed*.

| Grade | Descriptor |
| --- | --- |
| 90 - 100 | Outstanding |
| 85 - 89 | Very Satisfactory |
| 80 - 84 | Satisfactory |
| 75 - 79 | Fairly Satisfactory |
| Below 75 | Did Not Meet Expectations |

## Remedial classes

For a failed subject the registrar or adviser records the remedial class mark. The **recomputed final grade** is the
average of the original final grade and the remedial mark (rounded half up); the learner passes the subject if it is 75
or higher. The SF9 and SF10 show both. The general average keeps the original final grades.

## Honors (academic excellence)

| General average | Award |
| --- | --- |
| 90 - 94 | With Honors |
| 95 - 97 | With High Honors |
| 98 - 100 | With Highest Honors |

A learner also needs a final grade of **85 or higher in every subject**. The cut-offs are editable (Setup, School
profile). Conduct is not checked by the system; the adviser confirms it.

## Forms

- **SF9-SHS (Learner's Progress Report Card):** grades per subject, semester final grade, remarks, general average, attendance per month, observed values (Maka-Diyos, Makatao, Makakalikasan, Makabansa) with AO / SO / RO / NO, descriptors.
- **SF10-SHS (Learner's Permanent Academic Record):** every approved semester of this school plus encoded records of previous schools, remedial classes, signatories.
- Master list (SF1 style), summary of grades, honor roll as Excel.

The PDFs carry the content of the DepEd forms on short bond paper but are not pixel-for-pixel copies of the official
templates. Confirm with the division office that they are accepted for official use.
