"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Plus, RefreshCcw, X, Download, Trash2 } from "lucide-react"
import { FaGithub, FaLinkedin } from "react-icons/fa"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import * as htmlToImage from 'html-to-image'
import Tesseract from 'tesseract.js'
import "./screenshot.css"
import Loading from "./loading"

interface Course {
  id: number
  title: string
  units: string 
  grade: number
}

interface Term {
  id: number
  title: string
  courses: Course[]
  nextCourseId: number
  gpa: number
  recognition: string
  isCalculating: boolean
}

// Recognition criteria constants
const TERM_RECOGNITION = {
  FIRST_HONORS: {
    MIN_GPA: 3.4,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "First Honors Dean's List"
  },
  SECOND_HONORS: {
    MIN_GPA: 3.0,
    MAX_GPA: 3.399,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "Second Honors Dean's List"
  }
}

// summa cum laude, no grades below 2.0, no failing grades, 4.0 to 3.80
// magna cum laude, no grades below 2.0, no failing grades, 3.79 to 3.60
// cum laude, no grades below 2.0, no failing grades, 3.59 to 3.40
// honorable mention, no grades below 2.0, no failing grades, 3.39 to 3.20
const CGPA_RECOGNITION = {
  SUMMA_CUM_LAUDE: {
    MIN_GPA: 3.8,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "Summa Cum Laude"
  },
  MAGNA_CUM_LAUDE: {
    MIN_GPA: 3.6,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "Magna Cum Laude"
  },
  CUM_LAUDE: {
    MIN_GPA: 3.4,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "Cum Laude"
  },
  HONORABLE_MENTION: {
    MIN_GPA: 3.2,
    MIN_GRADE: 2.0,
    MIN_UNITS: 12,
    LABEL: "Honorable Mention"
  }
}

// Available grades
const AVAILABLE_GRADES = [4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.0]

export default function Home() {
  const [terms, setTerms] = useState<Term[]>([])
  const [nextTermId, setNextTermId] = useState<number>(1)
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [isCapturing, setIsCapturing] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const gridRef = useRef<HTMLDivElement | null>(null)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<"term" | "cgpa">("term")
  const [academicYear, setAcademicYear] = useState<string>("")
  const [hasImportedFromOCR, setHasImportedFromOCR] = useState<boolean>(false)
  const [isImportGuideOpen, setIsImportGuideOpen] = useState<boolean>(false)
  const [skipImportGuide, setSkipImportGuide] = useState<boolean>(false)
  const [isAccuracyDisclaimerOpen, setIsAccuracyDisclaimerOpen] = useState<boolean>(false)
  const [skipAccuracyDisclaimer, setSkipAccuracyDisclaimer] = useState<boolean>(false)
  // Projected standings (what-if) state (CGPA mode)
  const [targetHonorKey, setTargetHonorKey] = useState<'SUMMA_CUM_LAUDE' | 'MAGNA_CUM_LAUDE' | 'CUM_LAUDE' | 'HONORABLE_MENTION'>('CUM_LAUDE')
  // Assumed grade fixed at 4.0 for projections
  const targetAssumedGrade = 4.0
  const [targetUnitsPerCourse, setTargetUnitsPerCourse] = useState<number>(3)

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 1000)
  }, [])

  useEffect(() => {
    // initialize first term
    addTerm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // academic year string used in single term mode
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    let term = 0
    let academicStartYear = currentYear
    if (currentMonth >= 8 && currentMonth <= 11) {
      term = 1
    } else if (currentMonth >= 0 && currentMonth <= 3) {
      term = 2
      academicStartYear = currentYear - 1
    } else {
      term = 3
      academicStartYear = currentYear - 1
    }
    const academicYearStr = `AY ${academicStartYear}-${academicStartYear + 1}, Term ${term}`
    setAcademicYear(academicYearStr)
  }, [])

  useEffect(() => {
    // Load user's preference for skipping the import guide
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('skipImportGuide') : null
    if (stored === 'true') setSkipImportGuide(true)
    const stored2 = typeof window !== 'undefined' ? window.localStorage.getItem('skipAccuracyDisclaimer') : null
    if (stored2 === 'true') setSkipAccuracyDisclaimer(true)
  }, [])

  const createInitialCourses = useCallback((): Course[] => {
    return Array(4).fill(null).map((_, index) => ({
      id: index + 1,
      title: "",
      units: "3",
      grade: 4.0
    }))
  }, [])

  const computeTermStats = useCallback((courses: Course[]) => {
    const validUnits = courses.every(course => course.units !== "" && parseInt(course.units) > 0)
    const validGrades = courses.every(course => AVAILABLE_GRADES.includes(Number(course.grade)))
    if (!validUnits || !validGrades) {
      return { gpa: 0, recognition: "" }
    }
    let totalWeightedGrade = 0
    let totalUnits = 0
    courses.forEach(course => {
      const units = parseInt(course.units) || 0
      totalWeightedGrade += units * course.grade
      totalUnits += units
    })
    if (totalUnits === 0) {
      return { gpa: 0, recognition: "" }
    }
    const calculatedGPA = totalWeightedGrade / totalUnits
    const totalUnitsSum = courses.reduce((sum, c) => sum + (parseInt(c.units) || 0), 0)
    let recognitionText = ""
    const allCoursesPassMinGrade = courses.every(c => c.grade >= TERM_RECOGNITION.FIRST_HONORS.MIN_GRADE)
    if (calculatedGPA >= TERM_RECOGNITION.FIRST_HONORS.MIN_GPA && allCoursesPassMinGrade && totalUnitsSum >= TERM_RECOGNITION.FIRST_HONORS.MIN_UNITS) {
      recognitionText = TERM_RECOGNITION.FIRST_HONORS.LABEL
    } else if (calculatedGPA >= TERM_RECOGNITION.SECOND_HONORS.MIN_GPA && calculatedGPA < TERM_RECOGNITION.SECOND_HONORS.MAX_GPA && allCoursesPassMinGrade && totalUnitsSum >= TERM_RECOGNITION.SECOND_HONORS.MIN_UNITS) {
      recognitionText = TERM_RECOGNITION.SECOND_HONORS.LABEL
    }
    return { gpa: calculatedGPA, recognition: recognitionText }
  }, [])

  const addTerm = useCallback(() => {
    const initialCourses = createInitialCourses()
    const stats = computeTermStats(initialCourses)
    setTerms(prev => ([
      ...prev,
      {
        id: nextTermId,
        title: `Term ${prev.length + 1}`,
        courses: initialCourses,
        nextCourseId: 5,
        gpa: stats.gpa,
        recognition: stats.recognition,
        isCalculating: false
      }
    ]))
    setNextTermId(id => id + 1)
  }, [createInitialCourses, computeTermStats, nextTermId])

  const ensureMinimumTerms = useCallback((min: number) => {
    setTerms(prev => {
      const toAdd = Math.max(0, min - prev.length)
      if (toAdd === 0) return prev
      const newTerms: Term[] = []
      let localNextId = nextTermId
      for (let i = 0; i < toAdd; i += 1) {
        const courses = createInitialCourses()
        const stats = computeTermStats(courses)
        newTerms.push({
          id: localNextId,
          title: `Term ${prev.length + i + 1}`,
          courses,
          nextCourseId: 5,
          gpa: stats.gpa,
          recognition: stats.recognition,
          isCalculating: false
        })
        localNextId += 1
      }
      setNextTermId(localNextId)
      return [...prev, ...newTerms]
    })
  }, [createInitialCourses, computeTermStats, nextTermId])

  const resetTerm = useCallback((termId: number) => {
    const courses = createInitialCourses()
    const stats = computeTermStats(courses)
    setTerms(prev => prev.map(t => t.id === termId ? {
      ...t,
      courses,
      nextCourseId: 5,
      gpa: stats.gpa,
      recognition: stats.recognition,
      isCalculating: false
    } : t))
  }, [createInitialCourses, computeTermStats])

  const addCourse = useCallback((termId: number) => {
    setTerms(prev => prev.map(t => {
      if (t.id !== termId) return t
      if (t.courses.length >= 8) {
        toast.error("You've hit the maximum number of courses")
        return t
      }
      const newCourses = [...t.courses, { id: t.nextCourseId, title: "", units: "3", grade: 4.0 }]
      const stats = computeTermStats(newCourses)
      return {
        ...t,
        courses: newCourses,
        nextCourseId: t.nextCourseId + 1,
        gpa: stats.gpa,
        recognition: stats.recognition
      }
    }))
  }, [computeTermStats])

  const removeCourse = useCallback((termId: number, courseId: number) => {
    setTerms(prev => prev.map(t => {
      if (t.id !== termId) return t
      const newCourses = t.courses.filter(c => c.id !== courseId)
      const stats = computeTermStats(newCourses)
      return { ...t, courses: newCourses, gpa: stats.gpa, recognition: stats.recognition }
    }))
  }, [computeTermStats])

  const removeTerm = useCallback((termId: number) => {
    setTerms(prev => prev.filter(t => t.id !== termId))
    delete cardRefs.current[termId]
  }, [])

  const renameTerm = useCallback((termId: number) => {
    const current = terms.find(t => t.id === termId)
    const proposed = typeof window !== 'undefined' ? window.prompt("Rename term", current?.title || "Term") : null
    if (proposed && proposed.trim().length > 0) {
      setTerms(prev => prev.map(t => t.id === termId ? { ...t, title: proposed.trim() } : t))
    }
  }, [terms])

  const updateCourse = useCallback((termId: number, courseId: number, field: keyof Course, value: string | number) => {
    setTerms(prev => prev.map(t => {
      if (t.id !== termId) return t
      const newCourses = t.courses.map(c => c.id === courseId ? { ...c, [field]: value } as Course : c)
      const stats = computeTermStats(newCourses)
      return { ...t, courses: newCourses, gpa: stats.gpa, recognition: stats.recognition }
    }))
  }, [computeTermStats])

  // Dynamic calculation handled in update/add/remove/reset via computeTermStats

  const getTermTotalUnits = useCallback((term: Term) => {
    return term.courses.reduce((sum, c) => sum + (parseInt(c.units) || 0), 0)
  }, [])

  // No manual validation for calculate button anymore

  const { cgpa, allUnits, weighted } = useMemo(() => {
    let weighted = 0
    let units = 0
    terms.forEach(t => {
      const termUnits = getTermTotalUnits(t)
      if (termUnits > 0 && t.gpa > 0) {
        weighted += termUnits * t.gpa
        units += termUnits
      }
    })
    return { cgpa: units ? weighted / units : 0, allUnits: units, weighted }
  }, [terms, getTermTotalUnits])

  // CGPA recognition (Standing ...) shown regardless of number of terms, if all grades >= 1.0
  const cgpaRecognition = useMemo(() => {
    const allCoursesPassMinGrade = terms.every(t => t.courses.every(c => (c.grade ?? 0) >= 1.0))
    if (!allCoursesPassMinGrade) return ""
    if (cgpa >= (CGPA_RECOGNITION as any).SUMMA_CUM_LAUDE.MIN_GPA) return `${(CGPA_RECOGNITION as any).SUMMA_CUM_LAUDE.LABEL} standing`
    if (cgpa >= (CGPA_RECOGNITION as any).MAGNA_CUM_LAUDE.MIN_GPA) return `${(CGPA_RECOGNITION as any).MAGNA_CUM_LAUDE.LABEL} standing`
    if (cgpa >= (CGPA_RECOGNITION as any).CUM_LAUDE.MIN_GPA) return `${(CGPA_RECOGNITION as any).CUM_LAUDE.LABEL} standing`
    if (cgpa >= (CGPA_RECOGNITION as any).HONORABLE_MENTION.MIN_GPA) return `${(CGPA_RECOGNITION as any).HONORABLE_MENTION.LABEL} standing`
    return ""
  }, [terms, cgpa])

  // Compute required number of additional courses to reach selected honor
  const targetHonorResult = useMemo(() => {
    const target = (CGPA_RECOGNITION as any)[targetHonorKey]
    if (!target) return null
    const targetMinGpa: number = target.MIN_GPA
    const u = Math.max(1, Math.floor(Number(targetUnitsPerCourse) || 0))
    const g = Number(targetAssumedGrade)

    if (allUnits === 0) {
      if (g >= targetMinGpa) {
        const projected = g
        return { coursesNeeded: 1, additionalUnits: u, projectedCgpa: projected, label: target.LABEL, targetMinGpa }
      }
      return { unreachable: true, reason: 'Assumed grade must be above target CGPA', label: target.LABEL, targetMinGpa }
    }

    if (cgpa >= targetMinGpa) {
      return { coursesNeeded: 0, additionalUnits: 0, projectedCgpa: cgpa, label: target.LABEL, targetMinGpa }
    }

    if (g <= targetMinGpa) {
      return { unreachable: true, reason: 'Assumed grade must be above target CGPA', label: target.LABEL, targetMinGpa }
    }

    const W = weighted
    const U = allUnits
    const numerator = targetMinGpa * U - W
    const denom = u * (g - targetMinGpa)
    const rawN = numerator / denom
    const n = Math.max(0, Math.ceil(rawN))
    const projected = (W + n * u * g) / (U + n * u)
    return { coursesNeeded: n, additionalUnits: n * u, projectedCgpa: projected, label: target.LABEL, targetMinGpa }
  }, [targetHonorKey, targetAssumedGrade, targetUnitsPerCourse, cgpa, allUnits, weighted])

  // Global calculation no longer needed; values update dynamically

  const downloadTermImage = useCallback((termId: number, gpaValue: number) => {
    const node = cardRefs.current[termId]
    if (!node) return

    setIsDownloading(true)
    setIsCapturing(true)
    document.body.classList.add('capturing-screenshot')

    setTimeout(() => {
      const options = {
        quality: 0.95,
        backgroundColor: '#F2F0EF',
        style: { display: 'inline-block', width: 'fit-content', borderRadius: '8px', boxShadow: 'none', margin: '0' }
      }
      htmlToImage.toJpeg(node, options)
        .then((dataUrl) => {
          const link = document.createElement('a')
          link.download = `dlsu-gpa-${gpaValue.toFixed(3)}.jpeg`
          link.href = dataUrl
          link.click()
          toast.success('GPA downloaded successfully!')
        })
        .catch((error) => {
          console.error('Error generating image:', error)
          toast.error('Failed to download image')
        })
        .finally(() => {
          setIsDownloading(false)
          setIsCapturing(false)
          document.body.classList.remove('capturing-screenshot')
        })
    }, 100)
  }, [])

  const downloadCgpaSummaryImage = useCallback(() => {
    if (!summaryRef.current) return
    const node = summaryRef.current
    setIsDownloading(true)
    setIsCapturing(true)
    document.body.classList.add('capturing-screenshot')

    setTimeout(() => {
      const options = {
        quality: 0.95,
        backgroundColor: '#F2F0EF',
        width: node.scrollWidth,
        height: node.scrollHeight,
        style: { borderRadius: '8px', boxShadow: 'none', margin: '0' }
      }
      htmlToImage.toJpeg(node, options)
        .then((dataUrl) => {
          const link = document.createElement('a')
          link.download = `dlsu-cgpa-${cgpa.toFixed(3)}.jpeg`
          link.href = dataUrl
          link.click()
          toast.success('CGPA summary downloaded successfully!')
        })
        .catch((error) => {
          console.error('Error generating image:', error)
          toast.error('Failed to download image')
        })
        .finally(() => {
          setIsDownloading(false)
          setIsCapturing(false)
          document.body.classList.remove('capturing-screenshot')
        })
    }, 100)
  }, [cgpa])

  const beginImportFlow = useCallback(() => {
    if (skipImportGuide) {
      fileInputRef.current?.click()
    } else {
      setIsImportGuideOpen(true)
    }
  }, [skipImportGuide])

  const getAyTermSortKey = useCallback((title: string) => {
    const m = title.match(/AY\s*(\d{4})-\d{4}\s*,?\s*Term\s*(\d+)/i)
    if (!m) return { valid: false, yearStart: 0, term: 0 }
    const yearStart = parseInt(m[1], 10) || 0
    const term = parseInt(m[2], 10) || 0
    return { valid: true, yearStart, term }
  }, [])

  // Preprocess image to improve OCR on normal zoom screenshots
  const loadImageElementFromFile = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        // Revoke object URL after load to free memory
        if (img.src.startsWith('blob:')) {
          try { URL.revokeObjectURL(img.src) } catch (_) { /* noop */ }
        }
        resolve(img)
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  const preprocessImageForOcr = async (file: File): Promise<HTMLCanvasElement> => {
    const img = await loadImageElementFromFile(file)

    const minimumTargetWidth = 1400
    const minimumTargetHeight = 900
    const scaleByWidth = minimumTargetWidth / (img.width || 1)
    const scaleByHeight = minimumTargetHeight / (img.height || 1)
    const autoScale = Math.max(1, Math.max(scaleByWidth, scaleByHeight))
    const scale = Math.min(autoScale, 2.5)

    const targetWidth = Math.max(1, Math.round((img.width || 1) * scale))
    const targetHeight = Math.max(1, Math.round((img.height || 1) * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // Enhance clarity: grayscale + contrast + slight brightness boost
    ctx.filter = 'grayscale(100%) contrast(1.4) brightness(1.1)'
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    return canvas
  }

  const handleOcrUpload = useCallback(async (file: File) => {
    try {
      console.log('[OCR] Selected file:', { name: file.name, size: file.size, type: file.type })
      const loadingId = toast.loading(`Importing ${file.name}… (0%)`)
      const preprocessedCanvas = await preprocessImageForOcr(file)
      const ocrOptions: any = {
        logger: (m: any) => {
          console.log('[OCR][tesseract]', m)
          const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null
          if (pct !== null) {
            toast.message(`Importing ${file.name}… (${pct}%)`, { id: loadingId })
          }
        },
        // Use explicit CDN paths to avoid failed fetches in some environments
        workerPath: 'https://unpkg.com/tesseract.js@v5/dist/worker.min.js',
        corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        // OCR tuning
        tessedit_pageseg_mode: 6, // Assume a uniform block of text
        user_defined_dpi: '300',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.,:/() '
      }
      const { data } = await Tesseract.recognize(preprocessedCanvas, 'eng', ocrOptions)
      const text = (data.text || '').replace(/\t/g, ' ')
      console.log('[OCR] Raw text length:', text.length)
      console.log('[OCR] Raw text sample (first 1000 chars):\n', text.slice(0, 1000))
      const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
      console.log('[OCR] Line count:', lines.length)

      // Collect sections from bottom to top using "Term GPA:" markers
      const sections: string[][] = []
      let current: string[] = []
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const l = lines[i]
        if (/^Term\s*GPA:/i.test(l)) {
          if (current.length) {
            sections.push(current.slice().reverse())
            console.log('[OCR] Closed section with', current.length, 'lines at index', i)
            current = []
          }
        } else {
          current.push(l)
        }
      }
      if (current.length) {
        sections.push(current.slice().reverse())
        console.log('[OCR] Closed final section with', current.length, 'lines')
      }

      console.log('[OCR] Detected sections:', sections.length)
      if (sections.length === 0) {
        toast.error('Could not detect term sections. Please upload a clearer image.', { id: loadingId })
        return
      }

      const allowedGradeNumbers = new Set([4.0,3.5,3.0,2.5,2.0,1.5,1.0,0.5,0.0])
      console.log('[OCR] Starting parse across sections…')

      const parsedTerms: Term[] = sections.map((sec, idx) => {
        // Try to find a header like "AY 2024-2025, Term 2"
        const header = sec.find(s => /^AY\s*\d{4}-\d{4}.*Term\s*\d/i.test(s))
        const title = header ? header.match(/^AY\s*\d{4}-\d{4}.*Term\s*\d/i)?.[0] || header : `Imported Term ${idx + 1}`
        console.log(`[OCR] Section ${idx + 1}: title=`, title, 'lines=', sec.length)

        const courses: Course[] = []
        let nextCourseId = 1
        for (const row of sec) {
          // Skip summary lines
          if (/Cumulative\s*GPA:/i.test(row) || /Term\s*GPA:/i.test(row)) continue
          // Skip non-graded rows (P/NGS etc.)
          if (/\bP\b|NGS|N\/A/i.test(row)) continue

          let workingRow = row
          // If this row contains the term header and a course on the same line, strip the header part
          if (/^AY\s*\d{4}-\d{4}.*Term\s*\d/i.test(workingRow)) {
            workingRow = workingRow.replace(/^AY\s*\d{4}-\d{4}.*?Term\s*\d\s*/i, '').trim()
            if (!workingRow) continue
          }

          // Extract last two numeric tokens (grade + units in any order)
          const nums = (workingRow.match(/\d+(?:\.\d+)?/g) || [])
          if (nums.length < 2) continue
          const a = nums[nums.length - 2]
          const b = nums[nums.length - 1]

          let gradeStr: string | null = null
          let unitsStr: string | null = null
          const aNum = parseFloat(a)
          const bNum = parseFloat(b)
          if (allowedGradeNumbers.has(aNum) && /^\d+$/.test(b)) {
            gradeStr = a
            unitsStr = b
          } else if (allowedGradeNumbers.has(bNum) && /^\d+$/.test(a)) {
            gradeStr = b
            unitsStr = a
          }
          if (!gradeStr || !unitsStr) continue
          // If units is marked as P or equals 0, treat as non-academic load and skip
          if (/^p$/i.test(unitsStr) || parseInt(unitsStr, 10) === 0) {
            console.log('[OCR]   Skipping non-academic load row (units P/0):', workingRow)
            continue
          }

          const titlePart = workingRow.replace(new RegExp(`${a}.*${b}$|${b}.*${a}$`), '').replace(/\s{2,}/g, ' ').trim()
          const cleanedTitle = titlePart.replace(/^[−–•\s]+/, '')
          // Extract course code only (leading code-like token). Fallback to first word if regex fails.
          const codeMatch = cleanedTitle.match(/^[A-Z][A-Z0-9-]*/)
          const courseCode = codeMatch ? codeMatch[0] : (cleanedTitle.split(/\s+/)[0] || cleanedTitle)

          // Skip excluded course code prefixes: LCLS*, LASARE*, NSTP*
          if (/^(LCLS|LASARE|NSTP)/i.test(courseCode)) {
            console.log('[OCR]   Skipping non-academic course: ', courseCode, ' row= ', workingRow)
            continue
          }

          const grade = parseFloat(gradeStr)
          const units = unitsStr
          if (Number.isNaN(grade) || !/^\d+$/.test(units)) continue

          courses.push({ id: nextCourseId++, title: courseCode || `Course ${nextCourseId - 1}`, units, grade })
          console.log('[OCR]   Parsed course:', { title: cleanedTitle, units, grade })
        }

        const stats = computeTermStats(courses)
        console.log(`[OCR] Section ${idx + 1} parsed courses=`, courses.length, 'gpa=', stats.gpa.toFixed(3), 'recognition=', stats.recognition)
        return { id: 0, title, courses, nextCourseId, gpa: stats.gpa, recognition: stats.recognition, isCalculating: false }
      }).filter(t => t.courses.length > 0)

      console.log('[OCR] Parsed terms:', parsedTerms.map(t => ({ title: t.title, courses: t.courses.length, gpa: t.gpa })))
      if (parsedTerms.length === 0) {
        toast.error('No courses found. Please upload a clearer image.', { id: loadingId })
        return
      }

      // Append parsed terms with guaranteed unique IDs. If this is the first import
      // and there are default terms, drop them before appending.
      setTerms(prev => {
        const isProbablyDefault = prev.length <= 3 && prev.every(t => /^Term\s*\d+/i.test(t.title))
        const base = (!hasImportedFromOCR && isProbablyDefault) ? [] : prev
        const startId = base.length > 0 ? Math.max(...base.map(t => t.id)) + 1 : 1
        const withIds = parsedTerms.map((t, idx) => ({ ...t, id: startId + idx }))
        // Advance nextTermId beyond the highest ID we just assigned
        setNextTermId(current => Math.max(current, startId + parsedTerms.length))
        const merged = [...base, ...withIds]
        // Sort by AY ascending and Term ascending if titles are in the expected format
        merged.sort((a, b) => {
          const ka = getAyTermSortKey(a.title)
          const kb = getAyTermSortKey(b.title)
          if (ka.valid && kb.valid) {
            if (ka.yearStart !== kb.yearStart) return ka.yearStart - kb.yearStart
            return ka.term - kb.term
          }
          // Leave relative order for non-matching titles
          return 0
        })
        return merged
      })
      if (!hasImportedFromOCR) setHasImportedFromOCR(true)

      toast.success(`Imported ${parsedTerms.length} term${parsedTerms.length > 1 ? 's' : ''}`, { id: loadingId })
      if (!skipAccuracyDisclaimer) {
        setIsAccuracyDisclaimerOpen(true)
      }
    } catch (e) {
      console.error('[OCR] Failed:', e)
      toast.error('OCR failed')
    }
  }, [computeTermStats, nextTermId])

  if (isLoading) {
    return <Loading />
  }

  const containerMaxWidth = mode === 'term' ? 'lg:max-w-[60%]' : 'lg:max-w-[80%]'
  const courseColClass = mode === 'cgpa' ? 'min-w-[90px]' : 'min-w-[90px] md:min-w-[300px]'

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#F2F0EF] relative py-8">
      <div className={`w-full max-w-[95%] md:max-w-[90%] ${containerMaxWidth}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <CardTitle className="md:text-2xl text-[#087830] font-bold">{mode === 'term' ? 'DLSU GPA Calculator' : 'DLSU CGPA Calculator'}</CardTitle>
            {mode === 'term' ? (
              <CardDescription className="md:text-base font-semibold text-black">{academicYear}</CardDescription>
            ) : (
              <CardDescription className="md:text-base font-semibold text-black">
                Track your college progress so far...
              </CardDescription>
            )}
          </div>
          <div className={`flex flex-col md:flex-row items-center gap-2 ${isCapturing ? 'hidden' : ''}`}>
            {mode === 'cgpa' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const inputEl = e.currentTarget
                    const files = inputEl.files ? Array.from(inputEl.files) : []
                    // Clear immediately to avoid React synthetic event nulling
                    inputEl.value = ''
                    if (files.length) {
                      for (const f of files) {
                        await handleOcrUpload(f)
                      }
                    }
                  }}
                />
                <Button onClick={beginImportFlow} className="w-full md:w-fit font-bold bg-[#087830] text-white cursor-pointer">Import from Image</Button>
                <Button onClick={addTerm} className="w-full md:w-fit font-bold bg-[#087830] text-white cursor-pointer">Add Term</Button>
                <Button onClick={() => downloadCgpaSummaryImage()} disabled={isDownloading} className="w-full md:w-fit font-bold bg-[#087830] text-white cursor-pointer">Download</Button>
              </>
            )}
            <Button onClick={() => { if (mode === 'term') { ensureMinimumTerms(3) } setMode(m => m === 'term' ? 'cgpa' : 'term') }} variant="default" className="w-full md:w-fit font-bold cursor-pointer bg-[#087830] text-white">
              {mode === 'term' ? 'Switch to CGPA Mode' : 'Switch to Term Mode'}
            </Button>
          </div>
        </div>

        {mode === 'cgpa' ? (
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-2 p-1">
          <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {terms.map((term) => {
            const totalUnits = getTermTotalUnits(term)
            return (
              <Card
                key={term.id}
                ref={(el) => { cardRefs.current[term.id] = el }}
                className={`relative w-full bg-[#F2F0EF] box-shadow-md overflow-hidden min-h-fit`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                      {mode === 'cgpa' ? (
                        <Input
                          type="text"
                          className="border-none shadow-none font-bold text-xl md:text-2xl p-0 h-auto"
                          value={term.title}
                          onChange={(e) => setTerms(prev => prev.map(t => t.id === term.id ? { ...t, title: e.target.value } : t))}
                        />
                      ) : (
                        <CardTitle className="md:text-2xl text-[#087830] font-bold">{term.title}</CardTitle>
                      )}
                      <p className="text-sm text-gray-500 font-semibold">Total Units: {totalUnits}</p>
                    </div>
                    <div className={`flex gap-1 ${isCapturing ? 'hidden' : ''}`}>
                      <Button variant="link" onClick={() => resetTerm(term.id)} title="Reset Term" className="hover:text-[#087830] cursor-pointer">
                        <RefreshCcw className="w-4 h-4" />
                      </Button>
                      <Button variant="link" onClick={() => removeTerm(term.id)} title="Remove Term" className="hover:text-red-600 cursor-pointer" disabled={terms.length <= 1}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={"" + ` ${courseColClass}`}>Course</TableHead>
                        <TableHead className="w-fit">Units</TableHead>
                        <TableHead className="w-fit">Grade</TableHead>
                        <TableHead className={`w-fit ${isCapturing ? 'hidden' : ''}`}>
                          <Button 
                            variant="link" 
                            onClick={() => addCourse(term.id)} 
                            className="hover:text-[#087830] cursor-pointer" 
                            title="Add Course"
                            disabled={term.courses.length >= 8}
                          > 
                            <Plus className="w-4 h-4" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {term.courses.map((course) => (
                        <TableRow key={course.id}>
                          <TableCell className={courseColClass}>
                            <Input
                              type="text"
                              className="border-none shadow-none font-semibold text-sm md:text-base"
                              placeholder={`Course ${course.id} (Optional)`}
                              value={course.title}
                              onChange={(e) => updateCourse(term.id, course.id, "title", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="w-fit">
                            <Input
                              type="text"
                              placeholder="Units"
                              className="border-none shadow-none font-semibold text-sm md:text-base"
                              value={course.units}
                              required
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                updateCourse(term.id, course.id, "units", value);
                              }}
                            />
                          </TableCell>
                          <TableCell className="w-fit">
                            <Select
                              value={course.grade.toString()}
                              onValueChange={(value) => updateCourse(term.id, course.id, "grade", parseFloat(value) || 0)}
                            >
                              <SelectTrigger className={`cursor-pointer font-semibold min-w-[80px] border-none shadow-none ${isCapturing ? 'no-chevron' : ''}`}>
                                <SelectValue placeholder="Select grade" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#F2F0EF]">
                                {AVAILABLE_GRADES.map((grade) => (
                                  <SelectItem key={grade} value={grade.toString()} className="bg-[#F2F0EF]">
                                    {grade.toFixed(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="w-fit"> 
                            <Button 
                              variant="link" 
                              size="sm" 
                              onClick={() => removeCourse(term.id, course.id)} 
                              className={`hover:text-red-500 ${isCapturing ? 'hidden' : ''}`}
                              disabled={term.courses.length <= 1}
                              title="Remove Course"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className={` flex flex-col md:flex-row md:justify-between justify-center md:items-center mt-8 gap-6`}>
                    <div className={`flex items-center h-8 text-sm md:text-base`}>
                      <p className="font-bold">
                        {term.isCalculating ? (
                          <span className="flex items-center gap-1">
                            Current GPA:&nbsp;
                            <span className="flex gap-1 text-[#087830]">
                              <span className="animate-bounce">.</span>
                              <span className="animate-bounce [animation-delay:0.2s]">.</span>
                              <span className="animate-bounce [animation-delay:0.4s]">.</span>
                            </span>
                          </span>
                        ) : (
                          <span>
                            Current GPA: 
                            <span className="block md:inline ml-1 text-[#087830]">{term.gpa.toFixed(3)}
                            {term.recognition && <span className="ml-1 text-[#087830]">({term.recognition})</span>}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`flex items-center h-8 hidden`}></div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          </div>
          
        </div>
        ) : (
          // Term GPA mode - show only the first term card, original layout
          terms[0] && (
            <div className="w-full">
              <Card
                ref={(el) => { cardRefs.current[terms[0].id] = el }}
                className={`relative w-full bg-[#F2F0EF] shadow-md overflow-hidden ${isCapturing ? 'min-h-0 md:min-h-0' : 'min-h-[730px] md:min-h-[700px]'}`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                      <Input
                        type="text"
                        className="border-none shadow-none font-bold text-xl md:text-2xl p-0 h-auto"
                        value={terms[0].title}
                        onChange={(e) => setTerms(prev => prev.map(t => t.id === terms[0].id ? { ...t, title: e.target.value } : t))}
                      />
                      <p className="text-sm text-gray-500 font-semibold">Total Units: {getTermTotalUnits(terms[0])}</p>
                    </div>
                    <div className={`flex gap-2 ${isCapturing ? 'hidden' : ''}`}>
                      <Button 
                        variant="link" 
                        onClick={() => downloadTermImage(terms[0].id, terms[0].gpa)} 
                        title="Download as Image"
                        className="hover:text-[#087830] cursor-pointer -mr-2"
                        disabled={isDownloading || terms[0].gpa === 0}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="link" onClick={() => resetTerm(terms[0].id)} title="Reset Term" className="hover:text-[#087830] cursor-pointer">
                        <RefreshCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={"" + ` ${courseColClass}`}>Course</TableHead>
                        <TableHead className="w-fit">Units</TableHead>
                        <TableHead className="w-fit">Grade</TableHead>
                        <TableHead className={`w-fit ${isCapturing ? 'hidden' : ''}`}>
                          <Button 
                            variant="link" 
                            onClick={() => addCourse(terms[0].id)} 
                            className="hover:text-[#087830] cursor-pointer" 
                            title="Add Course"
                            disabled={terms[0].courses.length >= 8}
                          > 
                            <Plus className="w-4 h-4" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {terms[0].courses.map((course) => (
                        <TableRow key={course.id}>
                          <TableCell className={courseColClass}>
                            <Input
                              type="text"
                              className="border-none shadow-none font-semibold text-sm md:text-base"
                              placeholder={`Course ${course.id} (Optional)`}
                              value={course.title}
                              onChange={(e) => updateCourse(terms[0].id, course.id, "title", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="w-fit">
                            <Input
                              type="text"
                              placeholder="Units"
                              className="border-none shadow-none font-semibold text-sm md:text-base"
                              value={course.units}
                              required
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                updateCourse(terms[0].id, course.id, "units", value);
                              }}
                            />
                          </TableCell>
                          <TableCell className="w-fit">
                            <Select
                              value={course.grade.toString()}
                              onValueChange={(value) => updateCourse(terms[0].id, course.id, "grade", parseFloat(value) || 0)}
                            >
                              <SelectTrigger className={`cursor-pointer font-semibold min-w-[80px] border-none shadow-none ${isCapturing ? 'no-chevron' : ''}`}>
                                <SelectValue placeholder="Select grade" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#F2F0EF]">
                                {AVAILABLE_GRADES.map((grade) => (
                                  <SelectItem key={grade} value={grade.toString()} className="bg-[#F2F0EF]">
                                    {grade.toFixed(1)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="w-fit"> 
                            <Button 
                              variant="link" 
                              size="sm" 
                              onClick={() => removeCourse(terms[0].id, course.id)} 
                              className={`hover:text-red-500 ${isCapturing ? 'hidden' : ''}`}
                              disabled={terms[0].courses.length <= 1}
                              title="Remove Course"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className={`${(!isCapturing) ? 'absolute bottom-6 left-6 right-6' : ''} flex flex-col md:flex-row md:justify-between justify-center md:items-center mt-8 gap-6`}>
                    <div className={`flex items-center h-8 text-sm md:text-base`}>
                      <p className="font-bold">
                        {terms[0].isCalculating ? (
                          <span className="flex items-center gap-1">
                            Current GPA:&nbsp;
                            <span className="flex gap-1 text-[#087830]">
                              <span className="animate-bounce">.</span>
                              <span className="animate-bounce [animation-delay:0.2s]">.</span>
                              <span className="animate-bounce [animation-delay:0.4s]">.</span>
                            </span>
                          </span>
                        ) : (
                          <span>
                            Current GPA: 
                            <span className="block md:inline ml-1 text-[#087830]">{terms[0].gpa.toFixed(3)}
                            {terms[0].recognition && <span className="ml-1 text-[#087830]">({terms[0].recognition})</span>}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`flex items-center h-8 hidden`}></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        )}

        {mode === 'cgpa' && (
          <div ref={summaryRef} className={`mt-8 ${isCapturing ? 'inline-block' : 'w-full'} p-4 rounded-md bg-white/60 border border-gray-200`}>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-bold">Cumulative GPA (CGPA): <span className="text-[#087830]">{cgpa.toFixed(3)}</span>{cgpaRecognition && <span className="ml-2 text-[#087830]">({cgpaRecognition})</span>}</p>
                <p className="text-sm text-gray-600">Across calculated terms • Total Units Counted: {allUnits}</p>
              </div>
              <div className="flex-1 md:max-w-[60%]">
                <div className="flex items-center justify-between">
                  <p className="font-bold">Projected Standings</p>
                </div>
                <div className="mt-2 flex flex-col md:flex-row gap-2 md:items-center">
                  <Select value={targetHonorKey} onValueChange={(v) => setTargetHonorKey(v as any)}>
                    <SelectTrigger className="min-w-[180px] font-semibold border-gray-300">
                      <SelectValue placeholder="Select honor" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#F2F0EF]">
                      <SelectItem value="HONORABLE_MENTION" className="bg-[#F2F0EF]">Honorable Mention</SelectItem>
                      <SelectItem value="CUM_LAUDE" className="bg-[#F2F0EF]">Cum Laude</SelectItem>
                      <SelectItem value="MAGNA_CUM_LAUDE" className="bg-[#F2F0EF]">Magna Cum Laude</SelectItem>
                      <SelectItem value="SUMMA_CUM_LAUDE" className="bg-[#F2F0EF]">Summa Cum Laude</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Assumed grade</span>
                    <span className="text-sm font-semibold">{targetAssumedGrade.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Units/course</span>
                    <Select value={targetUnitsPerCourse.toString()} onValueChange={(v) => setTargetUnitsPerCourse(parseInt(v))}>
                      <SelectTrigger className="min-w-[100px] font-semibold border-gray-300">
                        <SelectValue placeholder="Units" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#F2F0EF]">
                        {[1,2,3,4,5,6].map((u) => (
                          <SelectItem key={u} value={u.toString()} className="bg-[#F2F0EF]">{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-800">
                  {targetHonorResult ? (
                    ('unreachable' in targetHonorResult) ? (
                      <p className="text-red-600">
                        Increase assumed grade to reach <span className="font-semibold">{targetHonorResult.label}</span> (≥ {targetHonorResult.targetMinGpa.toFixed(2)} CGPA).
                      </p>
                    ) : targetHonorResult.coursesNeeded === 0 ? (
                      <p>
                        Projected Standing: <span className="font-semibold">{targetHonorResult.label}</span> — already met.
                      </p>
                    ) : (
                      <p>
                        Projected Standing: <span className="font-semibold">{targetHonorResult.label}</span> • Need <span className="font-semibold">{targetHonorResult.coursesNeeded}</span> {targetUnitsPerCourse}-unit {targetHonorResult.coursesNeeded > 1 ? 'courses' : 'course'} at {targetAssumedGrade.toFixed(1)} • Projected CGPA: <span className="font-semibold text-[#087830]">{targetHonorResult.projectedCgpa.toFixed(3)}</span>
                      </p>
                    )
                  ) : (
                    <p>Select a target standing to see recommendations.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isImportGuideOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white w-[92%] max-w-[720px] rounded-lg shadow-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-900">Before you import</h2>
              <button onClick={() => setIsImportGuideOpen(false)} className="text-gray-500 hover:text-gray-700">×</button>
            </div>
            <div className="space-y-3 text-sm md:text-base text-gray-700">
              <p>For the best OCR results, upload screenshots of your grades with clear text and minimal distractions.</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><span className="font-semibold">Keep zoom levels above 80%</span> so text is sharp and readable.</li>
                <li>You may upload <span className="font-semibold">one term per screenshot</span>, 
                    or <span className="font-semibold">multiple terms in a single screenshot</span> — both are supported.</li>
                <li>If including multiple terms, make sure <span className="font-semibold">each term’s header line </span> 
                    (e.g., <span className="font-mono">AY 2023-2024, Term 2</span>) is visible above its rows.</li>
                <li>Avoid <span className="font-semibold">uploading the same term</span> across different screenshots.</li>
                <li>Crop the screenshot to focus on the table of courses. Avoid extra UI or borders around it.</li>
                <li>Ensure each row clearly shows <span className="font-semibold">Course Code, Units, Grade</span>.</li>
                <li>Rows marked with a grade of <span className="font-mono">P</span>, a unit of <span className="font-mono">0</span>,  
                    or courses with prefixes of <span className="font-mono">LCLS*, LASARE*, NSTP*</span> are ignored automatically (not counted as academic load).</li>
                <li>You may select and upload <span className="font-semibold">multiple images at once</span>; 
                    they will be appended to your terms.</li>
              </ul>
            </div>
            <div className="mt-5 flex flex-col md:flex-row items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={skipImportGuide} onChange={(e) => { setSkipImportGuide(e.target.checked); if (typeof window !== 'undefined') window.localStorage.setItem('skipImportGuide', e.target.checked ? 'true' : 'false') }} />
                Don’t show this again
              </label>
              <div className="flex gap-2 w-full md:w-auto">
                <Button onClick={() => setIsImportGuideOpen(false)} variant="secondary" className="w-full md:w-fit">Cancel</Button>
                <Button onClick={() => { setIsImportGuideOpen(false); fileInputRef.current?.click() }} className="w-full md:w-fit bg-[#087830] text-white">I understand, continue</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAccuracyDisclaimerOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white w-[92%] max-w-[640px] rounded-lg shadow-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-900">Please review your imported data</h2>
              <button onClick={() => setIsAccuracyDisclaimerOpen(false)} className="text-gray-500 hover:text-gray-700">×</button>
            </div>
            <div className="space-y-3 text-sm md:text-base text-gray-700">
              <p>OCR may not be 100% accurate. Double‑check the following before relying on the results:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Course codes match your transcript.</li>
                <li>Units are correct (no <span className="font-mono">P</span> grade,  <span className="font-mono">0</span> unit, or <span className="font-mono">LCLS*, LASARE*, NSTP*</span> courses counted).</li>
                <li>Grades are correct, including any <span className="font-mono">0.0</span> entries.</li>
                <li>Terms are sorted by academic year and term as expected.</li>
              </ul>
            </div>
            <div className="mt-5 flex flex-col md:flex-row items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={skipAccuracyDisclaimer} onChange={(e) => { setSkipAccuracyDisclaimer(e.target.checked); if (typeof window !== 'undefined') window.localStorage.setItem('skipAccuracyDisclaimer', e.target.checked ? 'true' : 'false') }} />
                Don’t show this again
              </label>
              <div className="flex gap-2 w-full md:w-auto">
                <Button onClick={() => setIsAccuracyDisclaimerOpen(false)} className="w-full md:w-fit bg-[#087830] text-white">Okay, I’ll review</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`absolute bottom-4 right-4 flex items-center gap-2 text-sm text-gray-500 font-semibold ${isCapturing ? 'hidden' : ''}`}>
        <span>Made by dlmbaccay</span>
        <a href="https://github.com/dlmbaccay" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#087830] transition-colors">
          <FaGithub size={16} />
        </a>
        <a href="https://linkedin.com/in/dlmbaccay" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#087830] transition-colors">
          <FaLinkedin size={16} />
        </a>
      </div>
    </div>
  )
}
