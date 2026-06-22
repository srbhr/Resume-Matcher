# Upload job description

```bash
curl -X POST \
  'http://127.0.0.1:3000/api/v1/jobs/upload' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d @- <<'EOF'
{
  "job_descriptions": [
    "Airbnb was born in 2007 when two hosts welcomed three guests to their San Francisco home, and has since grown to over 5 million hosts who have welcomed over 2 billion guest arrivals in almost every country across the globe. Every day, hosts offer unique stays and experiences that make it possible for guests to connect with communities in a more authentic way.

The Community You Will Join:

Airbnb's mission is to create a world where anyone can belong anywhere. Essential to this mission is the ability to have authentic conversations with members of a global community. The Messaging Foundations team builds the platform that powers these conversations. As a Senior Software Engineer on the team, you will build innovative products, architect scalable solutions, collaborate across organizations, and help shape our roadmap - ensuring that our global community of guests and hosts can communicate seamlessly, wherever they are.

The Difference You Will Make:

You will build and operate the reliable, performant, and scalable infrastructure that powers all messaging experiences across Airbnb. You will build a platform that enables product teams across Airbnb to innovate new conversational experiences faster. You will support and deliver AI-powered features as part of the messaging intelligence platform, driving improvements in trip quality and reducing host effort through contextual assistance.

A Typical Day:

Lead multiple projects that improve the messaging experience
Mentor, guide, advocate and support the career growth of individual contributors
Write and review technical designs that solve large, open-ended foundational technical problems without clearly-known solutions
Collaborate with other engineers and cross-functional partners across Messaging and other organizations across the company to align on long-term technical solutions
Build knowledge of leading edge practices and trends
Drive key technical deliverables for the larger Communications organization
Your Expertise:

5+ years of relevant engineering hands-on work experience
Bachelor's, Master's or PhD in CS or related field
Exceptional architecture abilities and experience with architectural patterns of large, high-scale applications
Shipped several large scale projects with multiple dependencies across teams
Has technical leadership and strong communication skills with ability to lead other experienced engineers
Your Location:

This position is US - Remote Eligible. The role may include occasional work at an Airbnb office or attendance at offsites, as agreed to with your manager. While the position is Remote Eligible, you must live in a state where Airbnb, Inc. has a registered entity. Click here for the up-to-date list of excluded states. This list is continuously evolving, so please check back with us if the state you live in is on the exclusion list . If your position is employed by another Airbnb entity, your recruiter will inform you what states you are eligible to work from.

Our Commitment To Inclusion & Belonging:

Airbnb is committed to working with the broadest talent pool possible. We believe diverse ideas foster innovation and engagement, and allow us to attract creatively-led people, and to develop the best products, services and solutions. All qualified individuals are encouraged to apply.

We strive to also provide a disability inclusive application and interview process. If you are a candidate with a disability and require reasonable accommodation in order to submit an application, please contact us at: reasonableaccommodations@airbnb.com. Please include your full name, the role you're applying for and the accommodation necessary to assist you with the recruiting process.

We ask that you only reach out to us if you are a candidate whose disability prevents you from being able to complete our online application.

How We'll Take Care of You:

Our job titles may span more than one career level. The actual base pay is dependent upon many factors, such as: training, transferable skills, work experience, business needs and market demands. The base pay range is subject to change and may be modified in the future. This role may also be eligible for bonus, equity, benefits, and Employee Travel Credits.

Pay Range
$185,000—$220,000 USD"
  ],
  "resume_id": "fe0c10c0-439a-477b-a24f-d8586555c267"
}
EOF
```

Resume Id: fe0c10c0-439a-477b-a24f-d8586555c267
Job Id: feb52850-87c5-4c24-a960-6109f56ee2e3

# Job matching score

```bash
curl -X POST "http://127.0.0.1:3000/api/v1/scores" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"resume_id":"fe0c10c0-439a-477b-a24f-d8586555c267", "job_id":"feb52850-87c5-4c24-a960-6109f56ee2e3"}'
```
