# CV Processing & Optimization Workflow

#### [Link to Diagram](./docs/Workflow.png)

---

## 1. Overview

This workflow describes the end-to-end process for ingesting a CV, validating it, analyzing it using ATS and ML-based logic, optimizing its content, and returning a scored and improved CV to the client.

The system is designed to:

- Enforce strict input validation
- Automatically process compliant CVs
- Route non-compliant CVs for manual or review handling
- Apply ATS scoring, grammar checks, and ML-driven optimization
- Persist results and deliver structured output to the client

---

## 2. High-Level Workflow Stages

1. **CV Upload & Validation**
2. **Parsing & Data Extraction**
3. **ATS & Content Analysis**
4. **ML-Based Optimization**
5. **Result Persistence & Client Delivery**

---

## 3. Detailed Workflow Steps

### 3.1 CV Upload

**Trigger:**

- User uploads a new CV to the system.

---

### 3.2 Input Validation Layer

The system performs sequential validation checks:

#### 3.2.1 File Size Validation

- **Check:** CV file size
- **If too large:**
  - Terminate process
  - Mark CV as invalid
  - **END**

#### 3.2.2 Page Count Validation

- **Check:** Number of pages
- **If more than 2 pages:**
  - Mark CV as **Too Much Pages**
  - **END**

#### 3.2.3 File Type Validation

- **Check:** File format
- **If not PDF:**
  - Mark CV as **Wrong Format**
  - **END**

✅ Only CVs that pass **all validation checks** proceed to automated processing.

---

### 3.3 Parsing & Extraction

#### 3.3.1 File Parsing

- Parse the PDF structure to md (for token optimization)
- Extract raw text and layout information

#### 3.3.2 Data Extraction

- Check for data loss
- Prepare structured content for analysis

---

### 3.4 ATS & Resume Analysis

#### 3.4.1 ATS Scoring

- Load ATS jobs Requiermants from DB
- Run ATS scoring algorithm on extracted content
- Calculate compatibility score
- Store ATS score in the database

#### 3.4.2 Resume Section Matching

- Identify and match:

  - Skills
  - Experience
  - Education

- Determine best-fit resume sections based on ATS signals

---

### 3.5 Content Quality Checks

#### 3.5.1 Grammar Check

- Analyze CV text for grammatical and language issues

#### 3.5.2 Skill Distribution Check

- Verify whether multiple skills are overloaded on a single page
- Flag layout/content density issues

---

### 3.6 Optimization & ML Processing

#### 3.6.1 Adjustment Filter

- Determine whether content adjustments are required
- Apply jailbreak filtering logic before ML execution
- **If Jailbreak detected mark as jailbreaker and Skip ML**

#### 3.6.2 ML Prompt Wrapping

- Wrap structured CV data with prompts
- Prepare input for ML optimization engine

#### 3.6.3 Reduction Algorithm

- Execute reduction algorithm to:
  - Remove redundant content
  - Improve clarity and ATS alignment
  - Optimize length and phrasing

#### 3.6.4 Resume Update

- Update CV content based on ML and reduction outputs

---

### 3.7 Finalization & Output

#### 3.7.1 Final Execution

- Generate final optimized CV
- Combine with ATS score and metadata

#### 3.7.2 Persistence

- Write:

  - Final CV
  - ATS score

- Store results on the server

#### 3.7.3 Client Delivery

- Client parses server output
- Client receives:
  - Optimized CV
  - ATS score
  - Structured feedback

---

## 4. Databases Used

- **Manual Processing DB**
  For CVs exceeding page limits.
- **Review DB**
  For unsupported file formats.
- **Primary Processing DB**
  Stores parsed CVs, ATS scores, and final outputs.

---

## 5. Failure & Exit Points Summary

| Condition          | Action                                          | End |
| ------------------ | ----------------------------------------------- | --- |
| File too large     | Reject CV                                       | ✅  |
| >2 pages           | Mark too much pages                             | ✅  |
| Not PDF            | Mark as bad file format                         | ✅  |
| Jailbreak Detected | Mark as Jailbreaking file & skip ML proccessing | ❎  |

---

## 6. Key Design Characteristics

- Deterministic validation pipeline
- Early exits to save compute cost
- ML invoked **only** after strict validation
- Clear separation between automated and manual flows
- Server-driven final output for consistent client consumption

---
