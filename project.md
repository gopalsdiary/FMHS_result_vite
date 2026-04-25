# FMHS Result Management System - Project Documentation

## 📌 Project Overview
A modern, high-performance, and privacy-focused Result Management System built for educational institutions. The system allows administrators and teachers to efficiently manage student marks, calculate grades (GPA), and generate comprehensive reports.
** supabase mcp is connected.
Language: TypeScript ; English ; 
---

## ✅ Accomplishments & Core Features

### 1. Modernized UI/UX
- **Premium Design**: Built using the 'Outfit' font family, 32px border radius, and a clean, spacious layout.
- **Privacy-First Interface**: Implemented a "Show/Hide Names" toggle in mark entry tables to prioritize data entry speed and student privacy.
- **Dynamic Subject Switching**: Seamless transition between subjects with instant data reloading.

### 2. Intelligent Data Management
- **Local Persistence (Zero Data Loss)**: All unsaved marks are automatically cached in `localStorage`. If the browser closes or the internet goes out, data is restored instantly upon return.
- **Reset Functionality**: A one-click "🔄 RESET" feature to clear local changes and reload accurate data from the database.
- **Real-time Calculations**: Instant calculation of Totals (CQ + MCQ + Practical) as marks are entered.

### 3. Administrative Workflow
- **Exam Management**: System to create/edit exams with status control (Live/Archived).
- **Subject Rules**: Custom panel to define Pass/Full marks for CQ, MCQ, and Practical for every subject.
- **Teacher Assignments**: Granular control over which teacher can enter marks for specific classes, sections, and subjects.
- **Smart Import**: Logic to import students from `student_database` while ignoring those with "TC" status and preventing duplicate imports.

### 4. Teacher's Portal
- **Focused Entry**: Clutter-free table starting with 'Roll', followed by mark entry fields.
- **Role-Based Access**: Teachers only see subjects and classes they are assigned to.
- **Sync Feedback**: Visual cues (Orange for Pending, Green for Saved) to keep teachers updated on their progress.

---

## 🗄️ Database Architecture

- **`student_database`**: The master repository for all student metadata (Name, IID, Class/Section per year).
- **`FMHS_exams_names`**: Stores exam identity (Year, Status, Entry Permissions).
- **`FMHS_exam_subjects`**: Stores subject rules (Full marks, Pass marks, Components).
- **`fmhs_exam_data`**: The core results table storing marks, totals, and GPAs.
- **`FMHS_exam_teacher_assignments`**: Maps teachers to their specific entry duties.

---

## 🎨 Design Principles
- **Clarity**: Only essential data is visible by default.
- **Safety**: Multiple layers of confirmation before destructive actions (Reset/Delete).
- **Speed**: Optimized database scanning and localized caching for high-speed data entry.

---

## 🚀 Future Roadmap
- [ ] **Bulk Result Processing**: One-click final GPA calculation for an entire class based on all subjects.
- [ ] **Tabulation Sheet Generation**: High-quality PDF export for school records.
- [ ] **SMS Integration**: Automated mark/result alerts for parents.
- [ ] **Automated Backups**: Weekly snapshots of results for disaster recovery.
- [ ] **Performance Analytics**: Visual charts to track class performance trends over years.

---
একটা বিষয় খেয়াল কর, প্রজেক্টে একটি জিনিট যুক্ত করা হয় নি। 
6,7,8 এর বিষয় একই বা ভিন্ন ভিন্ন হতে পারে। আবার ৯,১০ এর ভিন্ন । ১১,১২ ক্লাসের ভিন্ন। 
-----------------
ডাটাবেস এ তো অনেকগুলো বিষয় থাকবে। সেক্ষেত্রে কোন ক্লাসের কোন কোন বিষয় আছে সেটি সিলেক্ট করে নিদিষ্ট করা যাবে। 
সেটির উপর ভিত্তি করে /total-average/* ; /subject-gpa/*; /gpa-final/* এ আপডেট করতে হবে।  
শিক্ষার্থীর কয়টি বিষয় আছে, কয়টিতে অনুপস্থিত সেটিও নিখুত ভাবে করতে হবে। 
-----------------------
এরপর, 6,7,8 এর ক্ষেত্রে ৪র্থ বিষয় নেই; ৯,১০,১১,১২ এর ক্ষেত্রে আছে। 
 6,7,8 এ কিছু বিষয়ের মার্ক ক্লাসের র‍্যাঙ্ক এর ক্ষেত্রে কাজে লাগবে না। তাই সেটিও নির্ধারণ করতে হবে আগেই। 
-------------------------- 
৪র্থ বিষয় student_database টেবিলের optional_subject column এর থেকে মেচিং করিয়ে নিবে। 

রেজাল্ট প্রসেসিং যেহেতু ; সেহেতু নিখুতভাবে করতে হবে। 
শিক্ষার্থীদের আলাদা আলাদা  optional_subject থাকতে পারে। 

*Last Updated: 2026-04-24*



1. supabase mcp is connected.
2. exam_ann25 table is created and sql code is in exam_ann25.sql
3. student_database table is created and sql code is in student_database.sql
4. subject_selection table is created and sql code is in subject_selection.sql
5. Next step is to create the frontend.
6. create a new table named "fmhs_exam_data"
7. now make a system for create exam name and year.
    a) exam id auto increment
    b) exam name, year from user input
    c) then student load options based on class and section
    d) then load student for this exam in options from student_database table
    select year then load student form class_year, section_year, roll_year  ; like if year is 2026, then load student form class_2026, section_2026, roll_2026  tables; if year is 2027, then load student form class_2027, section_2027, roll_2027  tables; and so on.
    e) then make a system to input marks for each student.
    f) subject যোগ করার অপশন থাকবে; sabject code থাকবে, সাবজেক্ট কোড অনুযায়ী পাস ফেল নির্ধারণ এর ব্যবস্থা থাকবে, cq, mcq, practical, total, এ কত মার্ক এ পাশ সেটি নির্ধারণ করার প্যানেল থাকবে। এটি চিন্তা করে কর।
    **
    g) এখন যেভাবে ফরমেটে আছে সেভাবে, *বিষয়েরনাম_cq,mcq,practical,total,gpa থাকবে. 
    f) exam যোগ করার পর সেই এক্সাম এর জন্য আলাদা প্যানেল হবে। এখন যেমন একটি প্যানেল আছে, সেভাবে। 
    g) এক্সাম লাইভ হবে কিনা সেই অপশন থাকবে। 
    h) mark entry শিক্ষক দিবে কিনা সেই অপশন থাকবে। Teacher access অপশন থাকবে, কাকে কোন ক্লাস এর কোন সেকশনের মার্ক এন্ট্রির সুযোগ পাবে। 
    i) লাইভ করার পর শিক্ষক তার প্যানেল এ এন্ট্রির জন্য দেখতে পারবে। 
    j) সব এক্সাম একই টেবিলে হবে, যার কারণে একজন শিক্ষার্থীর iid দুইবারও আসবে, তাই এক্সাম নেম দিয়ে ভেবে কিছু করতে হবে। 
    k) কোন শিক্ষার্থীর কতটি বিষয় আছে সেটি বলে দেওয়া যাবে। এক জনের ধর ৭ বিষয়, কিন্তু ঐ ক্লাসে মোট বিষয় সংখ্যা ১১টি। ঐ শিক্ষার্থীর বিষয় সংখ্যা দিয়ে অনুপস্থিতি হিসাবে করবে। 
    
কারণ কোনো একটি সময় একই সাথে একটি/২টি এক্সাম চলবে। কিছু এক্সাম বন্ধ থাকবে। যেমন Annual Examination 2025 শেষ হয়ে গেছে। কিন্তু এডমিন চাইলে কিছু ইডিট করতে পারবে। কিন্তু শিক্ষকগণ পারবে না। 

সব মিলিয়ে এক্সাম প্যানেল উন্নত কর। আলাদা আলাদা এক্সাম প্লেন হবে। আমি যেটি করেছিলাম সেটি একটি এক্সাম এর জন্য। তাই ভেবে উন্নত আর ইউজার ফ্রেন্ডলি, আলাদা আলাদা প্যানেল কর। 

ধরো লগইন করে ডুকলে "Annual Examination 2025" এই নামে একটি বাটন দেখাবে। সেখানে ক্লিক করলে, ঐ এক্সামের প্যানেল দেখাবে। 
একই রকম admin লগইন করে ঢুকলে অন্য এক্সাম প্যানেল যোগ/ডিলিট করতে পারবে, তবে কোনো এক্সামের কোনো বিষয়ের যদি কোনো মার্ক থাকে, তবে তা ডিলিট করতে পারবে না।

*Import Students করার সময় শিক্ষার্থীর "student_database" এ status চেক করবে। যদি "TC" হয় তবে সেটি ইমপোর্ট করবে না
*কোনো একটি পরীক্ষার জন্য একবার শিক্ষার্থী ইমপোর্ট করলে , পরে সেই শিক্ষার্থী আর ইমপোর্ট করবে ন। 

*পুরো প্রজেক্টে "fmhs_exam_data" ও "student_database" প্রজেক্ট থেকে ডাটা লোডের ক্ষেত্রে ডাটাবেজের শেষ রেকর্ড পর্যন্ত স্ক্যান করবে। এটি নিশ্চিত কর। 