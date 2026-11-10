---
title: IP and legal - patents, NDAs, ownership questions
status: needs your confirmation on every item under "Open questions"
last_updated: 2026-11-10
not_legal_advice: true
---

# IP and legal

This is my reading of the documents in the folder plus the two Google Patents pages. It is not legal advice. Several points below decide whether you can launch under your own name, so please read the **Open questions** section first.

## What exists

| Item | What it is | Where |
|---|---|---|
| US 9,792,818 B2 | Granted **parking** patent (priority 27 Aug 2012, granted 17 Oct 2017) | summary: `docs/sources/patents_google-patents-summary.md` |
| US 10,726,403 B2 (published as US 2015/0154578 A1) | Granted **toll** patent (priority 22 Jun 2012, granted 28 Jul 2020). This is the second link you sent. | same file |
| Patent draft | Original disclosure "Centralized parking payment" with 4 figures (Jun 2012) | `01_ip-legal/patent-draft_centralized-parking-payment.docx`, text in `docs/sources/patent-draft_centralized-parking-payment.md`, figures in `docs/assets/patent-draft-figures/` |
| NDAs (3 files) | Confidentiality and non-compete agreements, 14 May 2012 | `01_ip-legal/NDAs/` |
| Pitch deck | Slides 16-18 reproduce patent figures and mention "patent pending" | `docs/sources/pitch-deck_agile-parking-v8.md` |

You said you have "multiple patents under my name". Only the two above are identified by the links, and a third document is the draft. See open question 1.

## Open questions (resolve before you invest in building)

1. **Inventor and owner names.** Google Patents lists the inventors of both patents as **Adityakumar Akshaikumar Aggarwal and Sunil Goel**, with **no company assignee**. Your name does not appear on either page, in the draft, or in the NDAs. The NDAs name **Agile Partners Inc** (Michigan) as "Owner" of the idea and are signed for it by Aditya Aggarwal, and the old project paths in the code read `F:\Aditya\...`. If the patents are yours by assignment, license, or purchase, you need the paper trail (an **assignment recorded at the USPTO** is what normally proves it). If they are not, building a product that practises the claims needs a licence or a design-around. Please tell me which it is and I will adjust these docs.
2. **Are the patents still in force?** US patents need maintenance fees. For US 9,792,818 (granted 17 Oct 2017) the fees fall due 3.5, 7.5 and 11.5 years after grant, each with a 6-month window before and a 6-month surcharge grace after. The 7.5-year fee (due about 17 Apr 2025, grace ending about 17 Oct 2025) is already past today (10 Nov 2026). For US 10,726,403 (granted 28 Jul 2020) the 3.5-year fee fell due about 28 Jan 2024, with grace to about 28 Jul 2024, and the next is about 28 Jan 2028. Google shows both as "active" but says that is not a legal conclusion. Check **USPTO Patent Center / Patent Public Search -> Fees and maintenance** (or ask a patent attorney) before assuming either is alive.
3. **What the claims actually cover.** Claim 1 of the parking patent is broad (cloud server + user device + enforcement device + cellular network, area-based pricing, speed-based end-session reminder). A modern app will practise it. That is good if you own it and a risk if you do not. A short freedom-to-operate review is cheap compared with a launch.
4. **International coverage.** Patents are national. These are US grants (and a PCT application). I did not verify India, Canada, or EU status. Your stores will be global, so this matters for where you can enforce.
5. **Brand.** "Agile Parking" and "Agile Partners" are another company's names on the deck. For a new store listing you need your own name and a trademark search (USPTO, plus the countries you target).
6. **Third-party material.** The folder used to contain about 2.3 GB of another company's project (a Meritor / ArvinMeritor sales app: videos, PDFs, source) and old open-source libraries. None of it was parking. **You had it deleted on 2026-11-10.** See "Third-party material" below for what remains.

## The NDAs

Three files, all the same template, dated **14 May 2012**:

- Parties: **Agile Partners Inc** (owner of the "Idea": geo-location based parking and toll payment plus location-based marketing) and a recipient.
- Files are named for **Danielle Mason** and **Rob Eddy**, plus a blank template `ParkingApp.docx`. The Danielle file's body text still names Rob Eddy as recipient, so it was edited from the Rob Eddy copy. Signature block for the owner: Aditya Aggarwal.
- Terms I could see: recipient must not copy or modify confidential information; employees only on a need-to-know basis with their own NDA; return of materials on written request; **5-year restriction on competitive practices** from signing (so it ran to about May 2017); Michigan law; recipient cannot assign.
- I could not tell whether Danielle and Rob actually signed (no signature images or dates in the extracted text). The recipient address for Danielle is blank.

What this means for you: the NDAs protect **Agile Partners Inc's** information as of 2012. They do not give you rights, and they are probably expired or unsigned by now. Keep them as historical evidence, not as an asset.

## Third-party material

- **Deleted on 2026-11-10:** the Meritor / ArvinMeritor sales presentation app (built by a different vendor, Web Ascender, with Titanium) and the open-source libraries (Json.NET, log4net, a jQuery sample). The original `Parking/` folder turned out to be that Meritor app, which is why it looked like a "parking" project.
- `03_design-reference/competitor-screenshots_ParkingMate.docx`: screenshots of a competing app (Parking Mate). Reference only; do not copy its design or text.
- `03_design-reference/research/Jensen-2006_...pdf`: a published academic paper (Springer). Fine for private reference; do not redistribute.
- `02_business/market-research/TorontoParkingAuthority/`: Toronto Parking Authority 2003 and 2010 annual reports and a June 2009 staff report on pay-and-display operations. Public documents, useful market background.

## Recommended order of operations

1. Settle open question 1 and 2 (ownership + maintenance status). Everything else is built on it.
2. Decide the legal entity that will publish the app (you, or a company). App stores show that name, and Apple's organisation account needs a D-U-N-S number.
3. Get a short patent/FTO opinion if there is any doubt on ownership or if you want to enforce.
4. Pick a new product name and check the trademark.
5. Write the privacy policy and terms from scratch for the new app (location + payments make these mandatory for the stores).

Update 2026-11-10: you told me you own the patents and the parking app. I have taken that as the working assumption. Open questions 1 and 2 still stand as paperwork checks: keep the assignment/licence record and confirm maintenance-fee status, because stores, partners and investors may ask for them. The only deletion made was the unrelated Meritor project and libraries, at your request. Nothing was sent anywhere.
