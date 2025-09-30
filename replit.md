# Zebby's World - Health Tracker for EDS and Rare Conditions

## Overview

Zebby's World is a comprehensive health tracking application for individuals with Ehlers-Danlos Syndrome (EDS) and other rare conditions. It provides symptom tracking, AI-powered empathetic responses, community features, and a curated product marketplace. The platform aims to validate and support users often overlooked by traditional healthcare systems, fostering understanding and community. Key capabilities include personalized health insights, secure private health sharing, and social groups for peer support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Design System**: Tailwind CSS with shadcn/ui for a consistent and accessible user interface.
- **Iconography**: Lucide Icons for clear and uniform visual elements.
- **Routing**: Wouter for lightweight client-side navigation.

### Technical Implementations
- **Frontend**: React with TypeScript, leveraging functional components and hooks.
- **Backend**: Express.js with TypeScript for a RESTful API.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations, hosted on Neon.
- **Authentication**: Replit-based OIDC authentication with PostgreSQL-backed session management.
- **AI Integration**: OpenAI GPT-4o-mini and GPT-5 for empathetic responses, personalized insights, and an AI companion.
- **Build & Development**: Vite for fast development and optimized production builds, ESBuild for bundling, PostCSS for CSS processing.

### Feature Specifications
- **EDS-Focused Onboarding**: A 6-step flow personalizing the user experience with EDS-specific fields.
- **Symptom Tracking**: Detailed multi-symptom logging, including body-part specific tracking and intensity scales.
  - **Wave 3 Multi-Entry**: Support for logging multiple symptom entries for the same day with timezone-aware timestamptz storage. Uses `fromZonedTime` (date-fns-tz v3) for proper timezone conversion.
- **AI Companion (Zebby Avatar)**: A persistent, floating AI chat assistant providing empathetic support and context-aware responses.
- **AI Insights & Trends**: AI-powered analysis of health data (pain, flares, HR, sleep, hydration) to provide trends and non-medical advice.
- **Personal Circle**: Private health data sharing system with granular controls, secure invitations, and automated alert rules for designated members.
  - **Wave 3+ Herd Reach-Out**: Manual alert system with 10-minute cancel window, rate limiting (3/hour), and background processing. Requires `FF_HERD=true` and `VITE_FF_HERD=true` secrets.
- **Zebby Social (Groups)**: Community groups with a directory, state-based access control, post composer, interactive feed, and moderation tools. Includes age, gender, and diagnosis-gated access.
- **Referrals & Rewards**: System for viral growth, including unique referral codes, point-based rewards for referrals and activity, and a rewards ledger.
- **Marketplace Integration**: Read-only Shopify integration for curated products, including EDS-specific product reviews.
- **Content Moderation**: Reporting system for posts and comments with rate limiting.
- **Security**: Robust authentication, Zod validation, rate limiting middleware, and text sanitization (HTML stripping, XSS prevention).

### System Design Choices
- **Data Models**: Enhanced user profiles, detailed symptom logs, AI interaction history, product catalogs, and specialized product reviews.
- **Access Control**: Middleware-based route protection, ownership verification, and detailed access control for social groups based on user profile data.
- **Database Migrations**: SQL-based migration system for robust schema evolution.
- **Caching**: 24-hour caching for AI insights and efficient data retrieval.
- **Testing**: Comprehensive Playwright E2E test suite (though not runnable in Replit due to browser dependencies).

## External Dependencies

### Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe ORM for database interactions.

### AI Services
- **OpenAI GPT-4o-mini / GPT-5**: Used for natural language processing, empathetic responses, and personalized health insights.

### Authentication
- **Replit Auth**: OIDC-based authentication.
- **Express Session**: Session management.
- **Connect-pg-simple**: PostgreSQL-backed session store.

### Frontend Libraries
- **React**: UI library.
- **TypeScript**: Language for type safety.
- **Wouter**: Client-side routing.
- **TanStack Query**: Data fetching and caching.
- **Date-fns**: Date manipulation.
- **Radix UI**: Accessible component primitives.

### UI/Styling
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: Component library.
- **Lucide Icons**: Icon library.

### Development Tools
- **Vite**: Build tool and development server.
- **ESBuild**: Bundler.
- **PostCSS**: CSS pre-processor.

### Integrations
- **Shopify Storefront API**: For marketplace product data.