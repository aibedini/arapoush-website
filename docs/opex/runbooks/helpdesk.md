# Forms and helpdesk (P11)

Every website form is built in the console (**Forms**). Each submission becomes a ticket in
**Tickets**; replies go to the customer by email, and the customer's answers come back into the
same ticket.

## Set up

1. **Teams** (console, Teams and saved replies): create teams such as Sales and Support.
   - Add members, and mark leads. Leads receive SLA alerts and can edit the team.
   - Members switch "I'm available" off when away; round-robin assignment skips them.
2. **SLA targets** per team and priority, for first response and resolution.
3. **Mail** (`infra/.env`):
   - `SMTP_URL` sends email;
   - `SUPPORT_ADDRESS` is the reply-from address;
   - `IMAP_URL` is that address's mailbox, polled every minute.
   - Use a mailbox reserved for the helpdesk: every new message in it becomes a ticket or a reply.
4. **Forms:** set the team, priority, rules, notify addresses and the confirmation email, then
   **Publish**. The site updates within seconds.
   - A form with "its own page" is served at `/{locale}/forms/{slug}`.
   - It is listed in the sitemap and in `llms.txt` only if it is marked indexable.

## How tickets flow

- **Routing:**
  - the form's team and priority apply first, then each matching rule in order;
  - an available team member with the fewest open tickets is assigned (if auto-assign is on);
  - with nobody to assign, the whole team is notified.
- **Opening a ticket:**
  - it is recorded on the timeline (once per person per 10 minutes) and in the audit log;
  - "Who has seen it" lists every reader, and each message shows who has read it.
- **Refer** sends the ticket to a colleague or a team with an internal message. With "transfer
  ownership" the assignee changes too.
- **Internal notes** are never emailed. To notify a colleague, pick them under "notify".
- **Replies:**
  - each reply goes out from `SUPPORT_ADDRESS` with `[#number]` in the subject and threading
    headers;
  - a customer's answer reopens a waiting or resolved ticket;
  - "[#n]" in a subject is only trusted from that ticket's own requester;
  - auto-replies and bounces are ignored.
- **Spam:** marking a ticket as spam can block the sender for 30 days.
- **Retention:**
  - closed tickets are deleted after the form's retention (default two years);
  - erasure on request: super admin, with step-up.

## Privacy

- Subjects, requester details, answers, message bodies and attachments are encrypted at rest
  (AES-256-GCM, `INQUIRY_KEY`).
- Notifications and their emails carry only the ticket number.
- The audit log never holds personal data.

## Checks

- `/metrics`:
  - `opex_tickets_open`
  - `opex_tickets_sla_breached`
  - `opex_email_dead`: emails that failed after every retry
- Console, Teams and saved replies: mailbox status, the last poll time and error, and the outbox
  counts.
