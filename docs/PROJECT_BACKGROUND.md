# Family Recipe – Project Background

## Overview

I have created "Family Recipe" as a Christmas gift to my family. It is meant to be a private web application designed to make it easy for my family to share what we are cooking, preserve recipes, and give us a way to keep up to date on our latest dishes. It combines a simple social feed with structured recipe storage so that casual “look what I made tonight” posts and long-form recipes can live in the same space.

The app is not meant to be a public social network or a generic recipe site. It is intentionally scoped to work for only my family, creating a shared space that feels cozy, low-pressure, and personal.

---

## Origin of the Idea

Day-to-day, recipes and food photos in my family tend to be scattered across:

- Group texts with pictures of meals
- Screenshots of recipes
- Links that get lost in chat history
- Occasional handwritten or emailed recipes

This works in the moment but doesn’t build a long-term, searchable “family cookbook”, and it’s easy for good ideas to disappear. I wanted a way to:

- Preserve recipes we actually cook, in our own words
- Capture photos and reactions (“cooked this, it was great”)
- Keep everything private to my family, without ads or random people

Family Recipe grew out of that desire: a small, purpose-built app that feels more like a shared family journal than a public platform (but who knows where it will go!)

I started with an initial "V1" plan that was a bit "vibe codey" to be honest. It started with the product, going over the essential features that I wanted in the application. However it has since aligned well with out final project because I developed the V1 implementation to be a "local only" application - as I said before, purely focused on building out the essential product features.

As a result it has not followed the best (or any really) DevSecOps practices, as I just wanted to see if the idea is feasible. I have determined that it is indeed feasible to build out what I want to gift to my family and so now it's time to make it "production ready".

As we saw in our homework assignments with the wordguesser application, and talked about in the class discussion posts, reactionary DevSecOps can be difficult. So in order to curve some of that I will be looking to implement many of the concepts we have gone over throughout the semester in this application.

Essentially taking it from "V1" (a local app on my machine) to "V2" ( an enterprise level production grade application ).

To give context as to the work I have done on this application so far, below is a summary of where the application is at now I have created "V1 Summary" documentation that goes a bit more in depth on both the product and technical side of things.

I have also created a "V2 Plan" (that includes those class concepts) that I will be following in order to get this app to "production" AKA under the Christmas tree for my family.

---

## Product Concept (V1)

V1 focuses on a tight core of features:

- **Private family space**

  - One family “space” with a master key.
  - Each adult has their own account (admin (me) + members).

- **Timeline (Family Feed)**

  - A single family-wide feed of activity: new posts/recipes, comments, and “cooked this” check-ins.
  - Designed to replace the group text thread as the main place to share what we’re cooking.

- **Posts & Recipes**

  - A post can be:
    - A quick share: title + photo(s) + caption, or
    - A full recipe with ingredients, steps, time, servings, difficulty, course, and tags.
  - Only the original author (or admin) can edit, with optional change notes (e.g., “reduced garlic”).

- **Social Interactions**

  - Comments on posts (optionally with photos).
  - Emoji reactions on posts/comments.
  - “Cooked this!” events with optional rating and note.

- **Browse & Personal Lists**
  - Recipes tab with search and filters (title, author, tags, basic attributes).
  - Personal favorites list for each user.
  - Profile view with “My Posts”, “Cooked”, and “Favorites”.

V1 is deliberately narrow: there is no meal planning, grocery lists, OCR or URL import, or public sharing. The focus is a clean, pleasant experience for my family only.

---

## How V1 Has Been Built

V1 is implemented as a **modern full-stack web app**, with an emphasis on clarity, maintainability, and being easy to evolve:

- **Architecture**

  - A monolithic Next.js application using the App Router: frontend UI and JSON API live in the same codebase.
  - A relational database accessed through Prisma, with a schema aligned to the product spec (users, family space, posts, recipe details, comments, reactions, cooked events, favorites, tags, etc.).
  - Structured, versioned specs:
    - `PRODUCT_SPEC.md` – product behavior and UX.
    - `USER_STORIES.md` – user stories and acceptance criteria.
    - `TECHNICAL_SPEC.md` – domain model, API design, validation rules.

- **Development Approach**

  - I designed the initial app to be “product-first”: the core user experience, flows, and entities were defined before choosing specific implementations.
  - I used Figma to design a small set of mobile-first screens (auth, timeline, add post, post detail, cooked modal, recipes, profile, family members), which drive the component structure.

- **Current State**
  - Core features are implemented end-to-end: signup/login with family master key, post creation, recipe details, comments, reactions, cooked events, favorites, timeline, and profile views.
  - V1 is primarily “works on my machine” grade: suitable for local use and testing of the full product concept.
  - A separate V2 plan (`V2_PLAN.md`) outlines the path to a production-ready deployment, including Dockerization, managed database, CI/CD, testing, security hardening, splitting services, and more.

---

## Goals Going Forward

The immediate goal is to take this V1 implementation and evolve it into a **production-ready, family-usable app**:

- Keep the product small and personal, focused on my family.
- Add DevSecOps practices (tests, scans, CI/CD, etc.) so it behaves like a “real” production system.
- Make deployment repeatable and maintainable, so the app can reliably work for years to come.

The V2 Plan will go more into the technical details on what I need to do to make this happen.
