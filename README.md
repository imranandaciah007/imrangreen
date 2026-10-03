# Exhibit Harmony

System Overview & Architecture

Build a modern, high-density dashboard for managing, indexing, and auditing 300+ supporting evidence documents for a US Green Card petition (e.g., EB-1/EB-2 NIW/Family-based).

​Primary State / Mock Layer: Scaffold full mock data right now (30–40 sample records) simulating a connected Google Drive / Cloud storage folder. Design an architectural abstraction layer (DocumentProvider / service interface) so a real cloud storage sync (Google Drive / OneDrive / S3 API) can be hooked up later without rewriting the UI logic or schema.

​Core Data Model (EvidenceItem)

Each document must support:

​id: Unique identifier

​exhibitId: Standard legal exhibit format (e.g., Exhibit A-1, Exhibit B-4)

​fileName: Original file name (e.g., tax_return_2024.pdf)

​title: Human-readable label (e.g., "2024 Form 1040 Joint Tax Return")

​category: Primary petition bucket (e.g., Identity/Civil, Financial/Tax, Employment/Letters of Support, Proof of Relationship, Legal/Court records, Medical/Vaccination)

​subCategory: Granular classification

​fileType: PDF, DOCX, JPG, PNG

​fileSizeBytes: File size formatting

​pageCount: Total pages (crucial for master petition packet compilation)

​status: Dropdown with states (Missing, Draft, Needs Translation, Certified Translation Added, Reviewed & Ready, Included in Final Packet)

​dateOfDocument: Date the evidence was issued

​tags: Multi-select tags (e.g., #Critical, #JointAsset, #PrimaryEvidence, #SecondaryEvidence)

​cloudDriveUrl: URL or path placeholder for cloud drive integration

​notes: Rich-text or markdown scratchpad for legal annotations or lawyer feedback

​UI Layout & Key Views

​High-Level KPI Summary Bar (Top):

​Total Evidence Count (Target: 300+)

​Breakdown chips: Ready vs. In Review vs. Missing Translations

​Master Page Count accumulator (estimates total thickness/pages of the petition)

​Category progress bars (e.g., "Financial: 85% ready", "Identity: 100% ready")

​Global Command Palette & Quick Search (Cmd + K):

​Instant full-text filter across title, file name, exhibit ID, notes, and tags.

​Drive Folder Connect placeholder modal with an API Key / OAuth connection settings screen.

​Dynamic Filtering & Sorting Sidebar / Toolbar:

​Multi-select filter by Category, File Status, Translation Status, and Exhibit group.

​Batch actions: Bulk assign exhibit prefixes, bulk status update, bulk tag.

​Dual View Layout:

​Table View (Default): High-density spreadsheet-style table with sortable columns, quick status dropdowns, inline editable exhibit IDs, and an action drawer trigger.

​Kanban / Stage View: Cards organized by filing stages (Draft -> Needs Translation -> Legal Review -> Ready for Master Binder).

​Document Inspector Drawer (Side Sheet):

​Opens on item click.

​Displays full metadata, document preview placeholder (iframe/PDF viewer ready), audit history, attached translation file link, and a markdown note field for RFE (Request for Evidence) defense strategy.

​Exhibit Index & Table of Contents Generator:

​A dedicated tab that auto-formats a printable, exportable Table of Exhibits (USCIS format) with columns: Exhibit Number, Description, Category, Page Count, and Ready Status. Include a "Copy Index as Markdown" and "Export to CSV" button.

​Design System & UX Details

​Palette: Clean, professional legal-tech aesthetic (slate, deep navy, subtle borders, high contrast badges).

​Performance: Optimize for rapid scrolling and instant client-side filtering across 300+ records using virtualized rows or clean pagination.

​Interactions: Toast alerts on status changes, keyboard shortcuts for navigating through rows.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://imrangreen.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/477f2db6-404c-4b5d-9226-a269093af3f5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
