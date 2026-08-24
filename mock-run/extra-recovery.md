# Mock run — when a different AI model stops half-way

> A worker on another model wrote most of a file and then lost its connection.
> ORC can tell you exactly what it left behind, whose fault it was, and hand the
> rest to somebody who continues instead of starting again.

---

## 1. What this is about

You told ORC that small tasks may run on a cheaper model — DeepSeek, GLM, Kimi,
a model on your own laptop. That is `orc extra`, and it works.

Then one of those workers stops in the middle. The wifi drops. The provider
returns an error. The laptop sleeps. You close the terminal.

**The worker has already changed files on your disk.** It wrote five of six
lines and never wrote the sixth. Nothing warns you, and the build may even still
pass, because the file it half-wrote is not wired up yet.

Before ORC 0.54.0, ORC sent the same task again from the start — to a Claude
worker this time — as if nothing had happened. That new worker arrives at a file
that is already two-thirds written and has three bad choices:

- write the file again, and throw away work you already paid for;
- edit a file it thinks it knows and get it wrong, because its idea of the file
  is out of date;
- read the file first and then guess whether what is there is good work, an
  old attempt, or rubbish. It has no way to tell.

This release removes that. **A failed dispatch is a position, not a blank page.**

---

## 2. The story

You run a normal build. One task goes to your DeepSeek connection.

```
/orc
```

```
  extra: [0,40) → dipkshit/deepseek-v4-flash via api
  wave 1 · 3 tasks
```

Task `T-2` has to add a health route. The worker starts. It writes
`src/routes/health.js`. Then your wifi drops.

```
  ❌ dipkshit/deepseek-v4-flash — connection-lost-local:
     the connection was established and then died mid-response
```

ORC stops and tells you what it found.

---

## 3. What ORC knows, and why it knows it

Before that dispatch sent a single byte, ORC wrote down what your repository
looked like. Not the whole repository — only the files that task was allowed to
touch, plus the list of everything git already saw as changed.

That record is called the **journal**. It lives in
`.claude/orc/extra-journal/T-2/`.

**ORC writes it itself, while the dispatch runs.** It is not something the run
remembers to do at the end. This matters: if the process is killed, there is no
end. The record is already on disk.

Now ask what happened. This read is **free** — no model, no tokens:

```
orc extra reconcile T-2
```

```
  T-2 · attempt 1 of 1 — RESUMABLE
  the worktree moved off the baseline — there is a position
  dipkshit/deepseek-v4-flash · engine api · band [0,40)
  ended: failed · connection-lost-local (retryable)

  attributed: NETWORK
  the connection to deepseek failed, and an UNAUTHENTICATED probe of
  https://api.deepseek.com/v1/models also failed inside 3s. That points at this
  machine's network, not at the provider.
    · 3 turn(s) completed
    · 1 file(s) were written before it stopped
    · network probe: ECONNREFUSED after 3000ms
  ⚠ a Claude fallback would fail too — falling back here burns a second failure
    and a second cost for nothing.

  the position:
    src/routes/health.js — created (+7 −0)
    src/app.js — untouched
  last action: turn 4 of 12 · Write src/routes/health.js · ok
  fidelity: per-turn — every turn and every tool call was recorded as it happened.
  tokens so far: 8140/0/0/512 — read from the journal's per-turn vector. It is a
  FLOOR — the true total may be higher, because the dispatch died before it
  could report.

  acceptance (carried forward, UNEVALUATED):
    · GET /health returns 200 {status:'ok'}

  resume target: hold
  attributed to this machine's NETWORK. A Claude fallback would fail too, so
  hold the wave and say why — do not spend a second failure finding that out.
```

Read that last part again, because it is the point of the whole release.

**ORC did not send the task to Claude.** Your internet is down. A Claude worker
would fail for exactly the same reason, and you would have paid for two failures
instead of one. So ORC stopped and told you what to fix.

---

## 4. Whose fault was it

This is a real question with a real answer, and each answer means something
different for what you do next.

| verdict | what it means | what you do |
|---|---|---|
| `provider` | the other company's endpoint answered, and said no | send the task to Claude instead — that works |
| `network` | your machine could not reach anything | fix your connection; nothing else will work |
| `local` | something on this computer — a missing program, a disk error | fix it here |
| `worker` | the conversation was fine and the model ran out of turns or gave up | the task was too big for that band |
| `orc` | ORC built a request the endpoint refused | **an ORC bug**, and ORC says so |

ORC tells `provider` and `network` apart by making **one cheap request with no
key attached**, with a three-second limit. If that request gets any answer at
all — even a "wrong key" answer — the network is fine and the problem is the
endpoint. If it gets nothing, the problem is your machine.

`orc` is on that list on purpose. This is a report about somebody else's
service. A report that can never blame the person who wrote it is not a report
you should trust.

---

## 5. Continuing instead of starting again

Your wifi comes back. Now you continue:

```
orc extra resume-slice T-2 --out .orc/T-2.resume.json
```

```
  ✔ resuming T-2 on dipkshit/deepseek-v4-flash in a NEW session — 1 file(s)
    already changed on disk are carried into the slice, not re-done.

  target: extra dipkshit
  `connection-lost-local` is retryable, so the same profile gets it again in a
  NEW session — carrying the position it left behind.

  carried into the slice:
    src/routes/health.js — created (+7 −0)
    src/app.js — untouched

  /repo/.orc/T-2.resume.json
  orc extra dispatch --task /repo/.orc/T-2.resume.json --json
```

The new task file is the old one, plus a note at the top that ORC wrote:

> This task was already started by a worker that was cut off before it finished.
> **The repository already contains its partial work.** Do not start over and do
> not rewrite a file that is already correct. Read each file listed below before
> changing it. Finish the task; change nothing that is already done.
>
> `src/routes/health.js` — **created** by the previous attempt (+7 / −0 lines).
> `src/app.js` — **untouched**.
>
> Last recorded action: turn 4 of 12 · `Write src/routes/health.js` · ok.
> The previous attempt ended: `connection-lost-local` (attributed: network).

Then it runs like any other dispatch. There is no special mode and no new kind
of worker. Every rule that already protected you still applies.

The next worker reads the file, sees the six lines, adds the missing line, and
is done.

---

## 6. Four things a resume may never do

These are rules, not settings.

**It may never add a file to the list.** The task said which files it may
change. A continuation that could add one would widen that list through the one
door nobody is watching.

**It may never change what "done" means.** The goal was set before any of this
happened. A failure must not be allowed to lower its own bar.

**It may never change the score.** So it lands on the same band and the same
model. A resume is not a discount.

**It may never continue a task that changed.** ORC saved a fingerprint of the
original task. If the plan moved in between, ORC refuses and shows you both
fingerprints, because continuing a stale task quietly produces work nobody
asked for.

---

## 7. When ORC refuses

Six refusals, each with its own name, and each one writes nothing.

| name | what it means |
|---|---|
| `not-resumable` | nothing was written, so starting again is the right move |
| `in-flight` | that worker may still be running. Two workers on one file is worse than one lost worker |
| `reverted-file` | a file went **backwards** — closer to the last commit than it was. Something may have been deleted, and that is your call |
| `slice-drifted` | the task changed between attempts |
| `resume-cap` | you have already resumed this task twice (`extra_resume_max`) |
| `resume-disabled` | you turned `extra_resume` off |

`in-flight` is the important one. A dropped connection does **not** prove the
worker stopped. The other company's servers may still be sending. ORC waits for
one of two things: the process is gone, or the time it reserved has run out.

And it says the honest part out loud: after that time has passed, a process with
the same number is treated as somebody else's. That is a reasonable guess, not
proof, and ORC tells you which it is.

---

## 8. Dispatches that never came back at all

If the process was killed — you closed the terminal, the machine slept — ORC
never got to write down how it ended. That record has a beginning and no end.

ORC notices before your next run starts:

```
⚠ 1 foreign dispatch from an earlier run never reported back
  T-9 · local-opencode/deepseek-chat · started 11:15 · 1 declared file, 1 changed on disk
  orc extra reconcile T-9   →   resumable
```

**It tells you. It never continues it on its own.** Quietly finishing somebody
else's half-written change in your repository is not a thing ORC does without
asking — the same rule that makes ORC announce every task that leaves Claude.

It also does not stop your run. It is something to know, not a wall.

That killed dispatch cost real money, too. ORC recovers what it recorded and
writes it into the spending log, marked clearly:

> tokens recovered from the journal. This is a **floor** — the real total may be
> higher, because the dispatch died before it could report.

A number that might be too low is useful. A number that pretends to be exact is
not.

---

## 9. In the panel

```
orc ui
```

**Extra ▸ Recovery** lists every recorded dispatch. Click one and it opens in
place: which files changed and by how many lines, the last thing the worker did,
whose fault it was, and what the task had to achieve.

Two things about that screen:

- **The free read is a button. The paid one is a command you copy.** Reconciling
  costs nothing, so you can press it. Continuing the task costs money and runs a
  worker, so the panel gives you the command and you run it where work runs. The
  panel never runs work for you.
- **Every row keeps its place.** A dispatch with nothing to resume still shows,
  saying so. If ORC hid it, "there was nothing there" and "ORC never looked"
  would look the same.

**Extra ▸ Spending** now also shows how often each connection actually finishes:

```
dipkshit    41 dispatch(es) · 6 failed · 4 resumed · 1 never reported back   15% did not finish
            provider 2 · network 3 · local 0 · worker 1 · orc 0 · unattributed 0
            average time before a failure: 38s
```

Under ten dispatches it says **sample too small** and shows no percentage. A
rate worked out from three tries is noise with a percent sign on it.

---

## 10. What you can change

Two settings, and that is on purpose.

| setting | default | what it does |
|---|---|---|
| `extra_resume` | `on` | Continue a stopped dispatch instead of starting it again. On by default, because off is the broken behaviour. |
| `extra_resume_max` | `2` | How many times one task may be continued before ORC hands it to Claude and tells you. |

There is deliberately **no** setting for where a resume goes — ORC works that
out from what failed. There is **no** way to switch the journal off: a record you
can turn off is turned off on the day you needed it.

---

## 11. What it will not do

**It will not tell you whether a file is finished.** ORC will not count brackets
or guess that a line looks cut off. A checker that is right eight times in ten
teaches you to trust it the other two, and that is worse than having none. ORC
gives you the facts — what changed, what did not, what the worker last did — and
the worker that continues makes the judgement. Your build, your tests and the
reviewer are what decide whether the work is done, exactly as before.

**It will not continue anything by itself.** Every one of these steps is
something you asked for.

---

## 12. The one line to remember

> **A failed dispatch is a position, not a blank page.**

ORC knows what was there before, it knows what is there now, and it can tell the
next worker the difference — instead of pretending the first one never ran.
