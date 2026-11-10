---
title: Agile Partners "Agile Parking" pitch deck (v8, 5 Jul 2012) - cleaned conversion
source_file: 02_business/pitch-deck/AgilePartners-Parking-v8_2012-07-05.ppt
also_see: AgilePartners-Parking-v7_2012-07-04.ppt (differences listed at the bottom)
slide_images: docs/assets/pitch-deck-v8/slide01.png ... slide20.png
converted: 2026-11-10
conversion: text extracted with PowerPoint, then re-structured into bullets by hand. Wording kept; run-together lines split.
---

# Agile Parking pitch deck (v8)

Audience: Toronto Parking Authority (TPA). Company on the deck: **Agile Partners** (US and Canada arm of Dev Information Technology Ltd).
Numbers in this deck are 2012 sales claims, not verified facts. See `docs/01-project-overview.md` for how to treat them.

## 1. Title
"Agile Partners is a leading and a globally focused IT Strategy & Services Company." Slide has a "Presentation for:" placeholder.

## 2. Vision and mission
- **Vision:** trusted, vendor-neutral and value-based end-to-end IT solution partner for corporate enterprise and governments across the globe.
- **Mission:** listen to customer requests, explore technological alternatives, and deliver an easy to use, manageable, scalable solution with continuous support.

## 3. The company
- Agile Partners is the US and Canada operation of Dev Information Technology Ltd (privately held, founded 1997, Ahmedabad, India).
- 2000+ staff, 100+ customers in India and worldwide, about 20% growth a year for 3 years.
- End-to-end IT solutions; operations in Europe, USA, Canada.
- 24x7 NOC, 24x7 support, RFID restricted access, 24x7 CCTV.

## 4-5. Esteemed clients / Partners and associations
Logo slides (images only, no text). See slide images.

## 6. Awards and recognitions
- Microsoft: Best Sales Partner in e-Governance three years running; National Partner Award Best Public Sector SI (2006); Star Partner Public Sector (2007); Most Influential Public Sector Partner (2008); finalist Best ISV Product at WPC 2004 (Toronto); Public Sector Best Performing Regional Partner (2011).
- Best e-Governance Partner from Adobe (2011).
- ISO 9001:2000; NSIC-CRISIL SE1B rating; Microsoft Gold Certified Partner since 2000; President's Club (Dynamics); empanelled with Government of Gujarat.

## 7. What is Agile Parking?
**"Just Click Park! Plain & Simple!"** Hassle-free one-step process. Visual: PARK! -> PAY! -> GO!

## 8. Why it is good for TPA
- No CAPEX: no meters, cloud-based infrastructure, uses mobile devices users already own.
- OPEX a fraction of today's system (no coin collection, no meter maintenance).
- Better enforcement from real-time data; more revenue; manage customer behaviour.
- Real-time information on available parking for customers.
- Prevents leakage: cash and service theft, hardware malfunction, vandalism.
- Day, time and location pricing model; tourist-pass style products.
- Green: no battery or meter disposal, less energy.
- Better customer experience: no coins or cards at a meter, timely notifications.
- "Prepare for future".

## 9. Why it is good for TPA (cont.)
- Architecture: no ugly meters, clean landscape, no breaking footpaths to install meters.
- New products: tourist parking over weekends, day-and-time-based rates.
- Real-time data tells drivers where spots are available.
- Better enforcement using business intelligence; better decisions; automation.
- No downtime, maintenance or service cost; distributed cloud design.

## 10. What does it provide to my customers?
- Notification before parking time expires (no worry about forgetting).
- Extend parking time, or pay at the end, depending on payment methods the parking operator supports.

## 11. Moving from past to future: no meters
Image-only slide.

## 12. Enforcement and management
- Parking attendants use an app for enforcement.
- Quickly validate and see any infringements.
- Ability to text the customer or issue fines.
- Database of repeat offenders.
- Track a user's usage; offer variable prices to particular user types.
- Payment details stored with TPA, so fines and payments are collected cheaply.

## 13. "Prove it: give numbers" (cost model)
Source cited on slide: ipsgroupinc.com cost-comparison page (a meter-vendor page, not independent).
- One meter, OPEX + CAPEX = **$250 per year**. 10,000 meters = **$25M per year**.
- Agile Parking claimed at **under $2.5M per year**: TPA $2.0M maintenance, $1.9M network charges, $0.1M coin counting (figures as written on the slide, they do not obviously sum to $2.5M).
- Headline: **"CAPEX & OPEX cost model - 90% savings"**.

## 14. Self-service for the parking authority
Define parking areas with pricing rules; easy to implement and modify; no costly process to change.

## 15. Recommended approach
- Run Agile Parking **alongside existing meters**; do not renew meter maintenance contracts. Retire meters as they fail or become expensive.
- Mobile parking becomes standard in 5-10 years.
- Advantages: minimal investment, maximise existing investment, orderly migration as phone penetration grows, prestige for Toronto as a technology frontier.

## 16. Patent pending: information from patent
Diagrams from the patent filing: Fig 1 contextual diagram (user 104 with phone 101, car 107 with licence plate / QR 103, parking inspector 105 with phone 102, cloud 108 holding authentication, parking receipt = licence plate + geo-location + time, payment, notification (106), and cell network location-based services 109). Fig 3 level-0 process: Registration -> Parking -> Random check by parking officer -> Parking payment.

## 17. Information from patent filing: Cloud Parking Srv
Fig 2 block diagram of the cloud parking server. Layers, top to bottom:
- Central cloud: statistical analysis (262), reporting (261), administrative (260), rule engine (259), notification (258), validator (257), fraud detector (256), payment processor (255), audit trailer (263); data stores for location transaction data (251), customer payment profile (252), vendors payment profile (253), transactions (254).
- Parking application layer: OUT queue (231) and IN queue (236); customer profile (232), parking location + rates + rules (233), current user parking info (234); notification (241), fraud detector (240), payment calculator (239), registrar (238), validator (237), audit trailer (235).
- Gateways: telephone gateway 211 (CTI 212, IVR 213, manual 214), SMS/GPRS gateway 215, internet gateway 216.
- Carrier network with network location-based services (201).

## 18. Future toll application: patent pending
- Device-based location services track a vehicle on a toll road and charge the linked account directly.
- Multiple readings overcome the inaccuracy of a single reading; statistical analysis gives accurate tracking.

## 19. Action items
- Partnership: investment from Agile Partners in this initiative.
- Development team fully based in Toronto, which would become headquarters for the product.
- TPA using the Agile Partners parking solution. (v7 said instead: "Possibility of collaborating with TPA for pilot run".)

## 20. Q/A

---

## v7 to v8 differences
Only wording and formatting changed, except slide 19:
- v7 "Possibility of collaborating with TPA for Pilot Run" became v8 "Partnership - Investment from Agile Partners in this initiative; development team completely based out of Toronto and would become headquarter for this product".
- v7 numbered the enforcement bullets 1 to 4 (slide 12) and used "&Don't Renew" wording on slide 15; v8 cleaned both.
- Treat **v8 as the final version**; keep v7 only as history.
