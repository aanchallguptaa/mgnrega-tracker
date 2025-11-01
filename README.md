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

⚙️ Technical Architecture: Production Readiness

The system is engineered for scalability, reliability, and performance, critical for potential usage by millions of Indian citizens.

Technology Stack & Decoupling

Backend: Node.js (Express)

Database: MongoDB Atlas (Managed, scalable persistence)

Frontend: HTML/CSS/Vanilla JavaScript (Minimalist, mobile-first design)

Core Decision (High Availability): The application is decoupled from the external government API. All user queries hit the resilient MongoDB Atlas database, guaranteeing service uptime regardless of external API rate limits or downtime.

Scalability and Resilience

Database Optimization: MongoDB utilizes a Compound Index (stateCode: 1, districtName: 1, dataMonth: -1) to ensure critical data retrieval and state aggregation queries are near-instantaneous.

API Resilience: The frontend employs a custom callApi function with Exponential Backoff and retry logic to overcome transient network failures and high latency often encountered on mobile networks.

Data Seeding: The server uses an initializeDatabase script to seed the current month's performance data for all districts in Maharashtra upon startup, eliminating manual data entry.

Auto-Detect Location

The system implements robust, multi-stage logic to identify the user's district without asking them:

It uses the browser's native Geolocation API for coordinates.

It performs Reverse Geocoding via an external service (Nominatim).

It executes Advanced Fuzzy Matching logic in the backend to successfully normalize and match the detected English name (e.g., "Chhatrapati Sambhajinagar") against the complex bilingual names stored in the database.
