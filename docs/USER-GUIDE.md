# User guide

Pick your role. Every screen has the same layout: the menu on the left (on a phone: the bar at the bottom and the
menu button), your work in the middle.

## Administrator: first-time setup

Do these once, in order. The dashboard shows the same list as *Getting started*.

1. **First screen.** Enter the school name, your name, a username and a password only you know, and the school year
   (dates of the first and last day of classes). Leave *Load the sample ... curriculum* ticked unless you will type
   every subject yourself.
2. **Setup, School profile.** School ID, region, division, district, address, school head, registrar, logo. These print on
   report cards. Check the *Grading policy* (passing grade 75; honors cut-offs 90 / 95 / 98 with no subject under 85).
3. **Setup, Curriculum.** Check *Program of studies* against the subjects BNHS offers in each strand, semester and
   grade level. Rename, add or remove subjects (*Subjects* tab) and strands (*Strands* tab). A subject marked *Work
   Immersion / Research / Business Enterprise Simulation / Exhibit / Performance* uses the immersion weights.
4. **Setup, Users.** Add the registrar and every teacher. The screen shows a one-time password once: write it down and
   give it to the person. They must choose their own password at first sign-in. *Reset password* does the same for a
   forgotten password.
5. **Setup, School years.** Set the *School days per month* (used for attendance on report cards). Open Quarter 1 when
   teachers should start encoding.
6. Ask the registrar to create sections and enroll learners (below).

Later: **Audit log** shows who did what; **System and backup** downloads a copy of the database. Do this after each
quarter is approved and keep the file somewhere safe.

## Registrar

**Sections.** *Sections, Add section*: grade level, strand, name, adviser. The class records (one per subject per
semester) are created from the curriculum. Open *Classes* to give each class a teacher; the dashboard warns while
classes have none. If the curriculum changes later, open the section and press *Create missing class records*.

**Learners.** *Learners, Add learner* or *Import list*: save your class list as CSV with the headings **LRN, Last
Name, First Name, Sex, Birthdate** (Middle Name, Address, Guardian, Contact No are optional; *Download template*
gives you the file). Rows with a wrong LRN, sex or date are skipped and listed, the rest go in. Pick a section in the
import window to enroll everyone at once.

**Enrollment.** Open a section: *Add learners* (those not yet enrolled this year), move a learner to another section of
the same grade and strand, or set the status to *Transferred out* / *Dropped out*. Once scores exist a learner cannot
be removed, only marked.

**Approvals.** When teachers submit a quarter it appears under *Approvals*. Open a record to check it, then *Approve*
(locks it) or *Return* with a note that tells the teacher what to fix. *Approve all* handles a whole list. Teachers ask
to reopen an approved record; you see the request at the top of *Approvals*.

**Release.** On the dashboard (or *School years*) *Release* makes the approved grades of a quarter visible to learners and
parents. *Withdraw* hides them again.

**Learner accounts.** On a learner's page press *Create account*, or in a section press *Create learner accounts* to make
them all. The username is the LRN. Save the list of one-time passwords immediately; it is shown once.

**Reports.** *Reports* prints report cards for a whole section, the summary of grades, master list and honor roll.
A learner's SF10 permanent record is on the learner's page. Records from previous schools are typed in there, so they
print on the SF10 too.

## Teacher

**My classes** lists your subjects and sections with Q1 to Q4 chips (grey draft, blue submitted, green approved, yellow
returned). Open one.

1. **Add items.** *Add item*: choose Written Work, Performance Task or Quarterly Assessment, a title and the highest
   possible score (for example Quiz 1, 20 points). Reuse a quarter's items in another with *Copy items*.
2. **Enter scores.** Type in the grid. Arrow keys and Enter move between cells; you can paste a column copied from Excel.
   Type **EX** for an excused item (it is left out of that learner's total). Yellow cells are still blank. The
   Percentage Score, Weighted Score, Initial Grade and Quarterly Grade update as you type and are saved
   automatically ("All changes saved").
3. **Phone:** switch to *Learner* view to enter one learner's scores at a time.
4. **Submit.** Every score must be filled: enter 0 for work not handed in, or EX if excused. After *Submit* the
   record is locked until the registrar approves or returns it. A returned record shows the registrar's note.
5. **Mistake in an approved record?** *Request reopen* with a reason.

Scores can only change while the registrar has the quarter **open**. *Excel* exports the class record.

## Class adviser

Your advisory section is in the menu. Tabs:

- **Grades:** all subjects for the section. Choose Q1, Q2 or Final. Tick *Include grades not approved yet* to see work in progress. Click a learner for the card.
- **Attendance:** choose the month, enter the school days once, then days present and times tardy for each learner.
- **Observed values:** mark each behavior statement AO / SO / RO / NO per quarter.
- **Remedial:** failed subjects with fields for the remedial class mark and dates.
- **Report cards:** the SF9 for each learner or the whole section. Official copies contain approved grades only; *Draft copies* show everything and are watermarked.

## Learner and parent

Sign in with the LRN and the one-time password from the registrar, then choose your own password. *My grades* shows the
approved and released quarters, final grades, general average, attendance and a PDF of the report card. Parents use
the account the registrar creates for them (or the learner's).

## Common questions

**A teacher forgot the password.** Administrator: Setup, Users, key icon.
**The administrator forgot the password.** On the server computer: `npm run db:reset-password -w @bnhs/server -- admin`.
**A grade is wrong after approval.** Teacher requests reopen, registrar reopens, teacher corrects and submits again, registrar approves again. Every step is in the audit log.
**Weights changed by DepEd.** Setup, Curriculum, Weights, then *Recompute open class records*. Approved records are not touched.
