Our Voice, Our Rights: MGNREGA District Performance Tracker

This project is a high-performance, mobile-first web application designed to make official Mahatma Gandhi National Rural Employment Guarantee Scheme (MGNREGA) performance data accessible and understandable to the rural population of India, particularly those with low technical and data literacy.

🎯 The Challenge & Solution

The Government of India's MGNREGA data API is complex and unreliable for direct mass consumption.

Our Solution: We created a robust, custom web service that securely stores performance data in MongoDB Atlas and presents critical metrics (households worked, average wage, employment days) using clear visuals and context, ensuring 100% availability independent of the external government API.

📐 Design Philosophy: Low-Literacy Interface

The user interface prioritizes clarity and trust for rural users.

Bilingual Clarity: Primary text is in Hindi (हिन्दी) with clear English subtitles to ensure native comprehension.

Intuitive Metrics: All large statistics (like Households Worked) are displayed using Lakhs (L) and Crores (Cr), aligning with common Indian financial vernacular rather than raw, confusing numbers.

Instant Context: Performance is immediately compared against the State Average (Maharashtra) using clear, color-coded indicators (Above/Below), eliminating the need for data interpretation.

Accessibility: Navigation features two simple entry points: Manual District Selection and a large Auto-Detect Location button, minimizing user effort.

Tooltips: Simple info icons (ⓘ) provide concise, one-sentence explanations for complex program terms like "Average Days Provided."

Technology Stack 

Backend: Node.js (Express)

Database: MongoDB Atlas 

Frontend: HTML/CSS/Vanilla JavaScript 

