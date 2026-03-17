const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const GAP_DATA = [
    {
        key: 'crm',
        labels: {
            school: 'CRM / Enquiry Management',
            gym: 'CRM / Enquiry Management',
            manufacturing: 'CRM / Lead Management',
            hospital: 'Patient Enquiry Management',
            auditing: 'Client / Lead Management',
            default: 'CRM / Enquiry Management'
        },
        pitches: {
            school: 'No professional CRM or automated enquiry system detected. Exora CRM can automate lead capture, follow-ups, and convert more admissions—without any manual effort.',
            gym: 'No professional CRM or enquiry system detected. Exora CRM can automate lead capture, follow-ups, and convert more memberships—without any manual effort.',
            manufacturing: 'No professional CRM or Lead management system detected. Exora CRM can automate inquiry capture, follow-ups, and convert more B2B deals—without any manual effort.',
            hospital: 'No professional CRM or patient enquiry system detected. Exora CRM can automate enquiry capture, follow-ups, and convert more consultations—without any manual effort.',
            auditing: 'No professional CRM or client management system detected. Exora CRM can automate client intake, follow-ups, and help you convert more consulting deals automatically.',
            salon: 'No professional CRM or booking system detected. Exora CRM can automate appointment capture, follow-ups, and convert more bookings—without any manual effort.',
            default: 'No professional CRM or business enquiry system detected. Exora CRM can automate lead capture, follow-ups, and convert more deals—without any manual effort.'
        }
    },
    {
        key: 'lms',
        labels: {
            school: 'LMS / Online Learning',
            gym: 'Member Training Portal',
            manufacturing: 'Employee Training Portal',
            hospital: 'Patient Health Portal',
            auditing: 'Staff Training / Knowledge Base',
            default: 'Online Learning Portal'
        },
        pitches: {
            school: 'No LMS or online learning platform found. Exora LMS enables live/recorded classes, homework, quizzes, and parent-teacher communication—all in one place.',
            gym: 'No member training portal found. Exora enables workout tracking, diet plans, and trainer-member communication online.',
            manufacturing: 'No digital training or compliance portal found. Exora enables employee training, safety certifications, and documentation management.',
            hospital: 'No patient health portal found. Exora enables online medical reports, health education, and patient-doctor communication.',
            auditing: 'No digital knowledge base or staff training portal found. Exora enables secure documentation sharing, compliance training, and staff onboarding.',
            salon: 'No client service portal found. Exora enables online service menus, style guides, and stylist-client communication.',
            default: 'No online learning or portal found. Exora enables digital training and communication—all in one place.'
        }
    },
    {
        key: 'payment',
        labels: {
            school: 'Online Fee Payment',
            gym: 'Online Membership Payment',
            manufacturing: 'Online B2B Payments',
            hospital: 'Online Bill Payment',
            auditing: 'Online Professional Fees',
            default: 'Online Payments'
        },
        pitches: {
            school: 'No online fee payment gateway detected. Exora Payments allows parents to pay fees anytime via UPI, cards, or net banking—reducing admin workload by 80%.',
            gym: 'No online membership payment portal detected. Exora Payments allows members to pay fees anytime via UPI, cards, or net banking—reducing admin workload.',
            manufacturing: 'No online B2B payment gateway detected. Exora Payments allows clients to pay invoices anytime via UPI or net banking—streamlining your cash flow.',
            hospital: 'No online bill payment gateway detected. Exora Payments allows patients to pay medical bills anytime via UPI, cards, or net banking—reducing counter queues.',
            auditing: 'No online payment gateway detected. Exora Payments allows clients to pay professional fees safely via UPI, cards, or net banking—improving your collections.',
            salon: 'No online booking payment gateway detected. Exora Payments allows clients to pay for services anytime via UPI, cards, or net banking—reducing front-desk workload.',
            default: 'No online payment gateway detected. Exora Payments allows customers to pay anytime via UPI, cards, or net banking—streamlining your billing.'
        }
    },
    {
        key: 'admission',
        labels: {
            school: 'Online Admission Portal',
            gym: 'Digital Membership Registration',
            manufacturing: 'Vendor/Client Onboarding',
            hospital: 'Digital Patient Registration',
            auditing: 'Digital Client Onboarding',
            default: 'Digital Onboarding Portal'
        },
        pitches: {
            school: 'No digital admission process found. Exora Admissions digitises the entire process—from application to document upload and fee payment, cutting paperwork completely.',
            gym: 'No digital registration found. Exora digitises the entire membership process—from registration to document upload and fee payment.',
            manufacturing: 'No digital onboarding found. Exora digitises the entire vendor or client onboarding process—from registration to document verification.',
            hospital: 'No digital registration found. Exora digitises the entire patient registration and admission process—cutting paperwork and wait times.',
            auditing: 'No digital onboarding found. Exora digitises the entire client registration and data collection process—cutting down on manual emails and follow-ups.',
            salon: 'No digital booking system found. Exora digitises the entire appointment booking process—from slot selection to deposit payment.',
            default: 'No digital onboarding process found. Exora digitises the entire registration process—from application to document upload and payment.'
        }
    },
    {
        key: 'app',
        labels: {
            school: 'Mobile App / Parent Portal',
            gym: 'Mobile App / Member Portal',
            manufacturing: 'Mobile App / Client App',
            hospital: 'Mobile App / Patient App',
            auditing: 'Mobile App / Client Portal',
            default: 'Mobile App / Customer App'
        },
        pitches: {
            school: 'No mobile app or parent portal detected. Exora Parent App keeps parents updated with attendance, homework, fees, and notices—boosting their satisfaction.',
            gym: 'No mobile app or member portal detected. Exora Member App keeps members updated with attendance, workouts, fees, and notices.',
            manufacturing: 'No mobile app or client portal detected. Exora Client App keeps clients updated with order status, invoices, and shipping details.',
            hospital: 'No mobile app or patient portal detected. Exora Patient App keeps patients updated with appointments, reports, and prescriptions.',
            auditing: 'No mobile app or secure client portal detected. Exora Client App lets you share reports, tax filings, and updates with clients securely on their phones.',
            salon: 'No mobile app or client portal detected. Exora Client App keeps clients updated with appointments, points, and special offers.',
            default: 'No mobile app or customer portal detected. Exora App keeps your customers updated with services, bills, and notices.'
        }
    },
    {
        key: 'attendance',
        labels: {
            school: 'Attendance / ERP System',
            gym: 'Member Attendance System',
            manufacturing: 'Workforce Management / ERP',
            hospital: 'Staff Attendance / HMS',
            auditing: 'Staff Attendance / Roster',
            default: 'Attendance / Management System'
        },
        pitches: {
            school: 'No digital attendance or ERP system detected. Exora ERP lets teachers mark attendance digitally, auto-notifying parents and generating compliance reports.',
            gym: 'No digital attendance system detected. Exora ERP lets staff mark attendance digitally and generate member activity reports.',
            manufacturing: 'No digital workforce management system detected. Exora ERP lets you manage staff attendance, shifts, and compliance reports digitally.',
            hospital: 'No digital attendance or HMS system detected. Exora ERP lets you manage staff shifts, attendance, and record compliance digitally.',
            auditing: 'No digital staff attendance system detected. Exora ERP lets you manage staff schedules, attendance, and compliance tracking for multiple branch offices.',
            salon: 'No digital attendance or management system detected. Exora ERP lets you manage stylist schedules, attendance, and commission reports digitally.',
            default: 'No digital attendance or management system detected. Exora ERP lets you track staff attendance and generate reports digitally.'
        }
    },
    {
        key: 'chatbot',
        labels: {
            school: 'Live Chat / Chatbot',
            gym: 'Live Chat / Chatbot',
            manufacturing: 'Live Chat / Support Bot',
            hospital: 'Live Chat / Appointment Bot',
            auditing: 'Live Chat / FAQ Bot',
            default: 'Live Chat / AI Chatbot'
        },
        pitches: {
            school: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles admission queries 24/7 on WhatsApp and your website, converting visitors into enrolled students automatically.',
            gym: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles membership queries 24/7 on WhatsApp and your website, converting visitors into members automatically.',
            manufacturing: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles order queries 24/7 on WhatsApp and your website.',
            hospital: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles appointment booking 24/7 on WhatsApp and your website, converting visitors into patients automatically.',
            auditing: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles common tax or service queries 24/7, capturing leads even when your office is closed.',
            salon: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles booking queries 24/7 on WhatsApp and your website, converting visitors into clients automatically.',
            default: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles business queries 24/7 on WhatsApp and your website, converting visitors into leads automatically.'
        }
    },
    {
        key: 'ssl',
        labels: { default: 'Secure Website (HTTPS)' },
        pitches: {
            school: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with parents immediately.',
            gym: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with members immediately.',
            manufacturing: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with clients immediately.',
            hospital: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with patients immediately.',
            auditing: 'Website is not secure (no HTTPS). For an accounting firm, security is critical. Exora includes SSL to protect client communications.',
            salon: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with clients immediately.',
            default: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with visitors immediately.'
        }
    }
];

async function migrate() {
    try {
        console.log("🚀 Migrating Expanded Gap Definitions to Database...");
        for (const item of GAP_DATA) {
            await pool.query(`
                UPDATE score_config 
                SET labels_json = $1, pitches_json = $2 
                WHERE key = $3
            `, [JSON.stringify(item.labels), JSON.stringify(item.pitches), item.key]);
            console.log(`✅ Updated ${item.key}`);
        }
        console.log("🎉 Migration complete.");
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
migrate();
