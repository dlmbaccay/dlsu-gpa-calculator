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
  const [mode, setMode] = useState<"term" | "cgpa">("term")
  const [academicYear, setAcademicYear] = useState<string>("")

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
    const validGrades = courses.every(course => course.grade !== 0)
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

  const { cgpa, allUnits } = useMemo(() => {
    let weighted = 0
    let units = 0
    terms.forEach(t => {
      const termUnits = getTermTotalUnits(t)
      if (termUnits > 0 && t.gpa > 0) {
        weighted += termUnits * t.gpa
        units += termUnits
      }
    })
    return { cgpa: units ? weighted / units : 0, allUnits: units }
  }, [terms, getTermTotalUnits])

  // CGPA recognition (Standing ...) shown regardless of number of terms, if all grades >= 2.0
  const cgpaRecognition = useMemo(() => {
    const allCoursesPassMinGrade = terms.every(t => t.courses.every(c => (c.grade ?? 0) >= 2.0))
    if (!allCoursesPassMinGrade) return ""
    if (cgpa >= (CGPA_RECOGNITION as any).SUMMA_CUM_LAUDE.MIN_GPA) return `Standing ${(CGPA_RECOGNITION as any).SUMMA_CUM_LAUDE.LABEL}`
    if (cgpa >= (CGPA_RECOGNITION as any).MAGNA_CUM_LAUDE.MIN_GPA) return `Standing ${(CGPA_RECOGNITION as any).MAGNA_CUM_LAUDE.LABEL}`
    if (cgpa >= (CGPA_RECOGNITION as any).CUM_LAUDE.MIN_GPA) return `Standing ${(CGPA_RECOGNITION as any).CUM_LAUDE.LABEL}`
    if (cgpa >= (CGPA_RECOGNITION as any).HONORABLE_MENTION.MIN_GPA) return `Standing ${(CGPA_RECOGNITION as any).HONORABLE_MENTION.LABEL}`
    return ""
  }, [terms, cgpa])

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
              <CardDescription className="md:text-base font-semibold text-black">Add as many terms as you need. Each term has the same GPA table and units cap per course.</CardDescription>
            )}
          </div>
          <div className={`flex items-center gap-2 ${isCapturing ? 'hidden' : ''}`}>
            {mode === 'cgpa' && (
              <>
                <Button onClick={addTerm} className="font-bold bg-[#087830] text-white cursor-pointer">Add Term</Button>
                <Button onClick={() => downloadCgpaSummaryImage()} disabled={isDownloading} className="font-bold bg-[#087830] text-white cursor-pointer">Download</Button>
              </>
            )}
            <Button onClick={() => { if (mode === 'term') { ensureMinimumTerms(3) } setMode(m => m === 'term' ? 'cgpa' : 'term') }} variant="default" className="font-bold cursor-pointer bg-[#087830] text-white">
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
                    <div className={`flex gap-2 ${isCapturing ? 'hidden' : ''}`}>
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
            <p className="font-bold">Cumulative GPA (CGPA): <span className="text-[#087830]">{cgpa.toFixed(3)}</span>{cgpaRecognition && <span className="ml-2 text-[#087830]">({cgpaRecognition})</span>}</p>
            <p className="text-sm text-gray-600">Across calculated terms • Total Units Counted: {allUnits}</p>
          </div>
        )}
      </div>

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
