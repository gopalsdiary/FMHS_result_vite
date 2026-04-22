import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Auth
import LoginPage from './pages/LoginPage'
import LoginTeacherPage from './pages/LoginTeacherPage'

// Dashboards
import ResultDashboardPage from './pages/ResultDashboardPage'
import TeacherDashboardPage from './pages/TeacherDashboardPage'

// Result workflow
import PrintResultsPage from './pages/PrintResultsPage'
import TotalAveragePage from './pages/TotalAveragePage'
import SubjectGpaPage from './pages/SubjectGpaPage'
import GpaFinalPage from './pages/GpaFinalPage'
import ResultListPage from './pages/ResultListPage'
import FailReportPage from './pages/FailReportPage'
import ProcessResultsPage from './pages/ProcessResultsPage'
import ResultViewPage from './pages/ResultViewPage'

// Grade entry
import GradeEntrySystemPage from './pages/GradeEntrySystemPage'
import GradeEntry2Page from './pages/GradeEntry2Page'
import GradeManagementPage from './pages/GradeManagementPage'

// Student pages
import StudentDetailsPage from './pages/StudentDetailsPage'
import StudentDetailsAccessPage from './pages/StudentDetailsAccessPage'
import StudentManagementPage from './pages/StudentManagementPage'
import DataListPage from './pages/DataListPage'
import DetailsResultPage from './pages/DetailsResultPage'

// Setup / admin
import SubjectSetupPage from './pages/SubjectSetupPage'
import SubjectTeacherPage from './pages/SubjectTeacherPage'
import ClassSubjectPage from './pages/ClassSubjectPage'
import TeacherSetupPage from './pages/TeacherSetupPage'
import ResultEntryPage from './pages/ResultEntryPage'
import ResultEntryAdminPage from './pages/ResultEntryAdminPage'
import ResultTableColmAddPage from './pages/ResultTableColmAddPage'

// Reports
import SmsPage from './pages/SmsPage'
import SmsFullPage from './pages/SmsFullPage'
import SummaryPage from './pages/SummaryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login-teacher" element={<LoginTeacherPage />} />

        {/* Dashboards */}
        <Route path="/dashboard" element={<ResultDashboardPage />} />
        <Route path="/teacher-dashboard" element={<TeacherDashboardPage />} />

        {/* Result workflow */}
        <Route path="/print-results" element={<PrintResultsPage />} />
        <Route path="/total-average" element={<TotalAveragePage />} />
        <Route path="/subject-gpa" element={<SubjectGpaPage />} />
        <Route path="/gpa-final" element={<GpaFinalPage />} />
        <Route path="/result-list" element={<ResultListPage />} />
        <Route path="/fail-report" element={<FailReportPage />} />
        <Route path="/process-results" element={<ProcessResultsPage />} />
        <Route path="/result-view" element={<ResultViewPage />} />

        {/* Grade entry */}
        <Route path="/grade-entry" element={<GradeEntrySystemPage />} />
        <Route path="/grade-entry-2" element={<GradeEntry2Page />} />
        <Route path="/grade-management" element={<GradeManagementPage />} />

        {/* Student pages */}
        <Route path="/student-details" element={<StudentDetailsPage />} />
        <Route path="/student-details-access" element={<StudentDetailsAccessPage />} />
        <Route path="/students" element={<StudentManagementPage />} />
        <Route path="/datalist" element={<DataListPage />} />
        <Route path="/details-result" element={<DetailsResultPage />} />

        {/* Setup / admin */}
        <Route path="/subject-setup" element={<SubjectSetupPage />} />
        <Route path="/subject-teacher" element={<SubjectTeacherPage />} />
        <Route path="/class-subject" element={<ClassSubjectPage />} />
        <Route path="/teacher-setup" element={<TeacherSetupPage />} />
        <Route path="/result-entry" element={<ResultEntryPage />} />
        <Route path="/result-entry-admin" element={<ResultEntryAdminPage />} />
        <Route path="/result-table" element={<ResultTableColmAddPage />} />

        {/* Reports */}
        <Route path="/sms" element={<SmsPage />} />
        <Route path="/sms-full" element={<SmsFullPage />} />
        <Route path="/summary" element={<SummaryPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
