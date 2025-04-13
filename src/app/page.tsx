"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Plus, RefreshCcw, X, Download } from "lucide-react"
import { FaGithub, FaLinkedin } from "react-icons/fa"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
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

// Recognition criteria constants
const RECOGNITION = {
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

// Available grades
const AVAILABLE_GRADES = [4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.0]

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([])
  const [gpa, setGpa] = useState<number>(0)
  const [nextId, setNextId] = useState<number>(1)
  const [isCalculating, setIsCalculating] = useState<boolean>(false)
  const [academicYear, setAcademicYear] = useState<string>("")
  const [recognition, setRecognition] = useState<string>("")
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [isCapturing, setIsCapturing] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }, [])

  // Initialize with 4 blank courses and calculate academic year
  useEffect(() => {
    initializeBlankCourses()
    initializeAcademicYear()
  }, [])

  const initializeBlankCourses = useCallback(() => {
    const initialCourses = Array(4).fill(null).map((_, index) => ({
      id: index + 1,
      title: "",
      units: "3",
      grade: 4.0
    }))
    setCourses(initialCourses)
    setNextId(5) // Set next ID to 5 since we used 1-4 for initial courses
    setGpa(0)
    setRecognition("")
  }, [])

  const initializeAcademicYear = useCallback(() => {
    const now = new Date()
    const currentMonth = now.getMonth() // 0-11 (Jan-Dec)
    const currentYear = now.getFullYear()
    
    let term = 0
    let academicStartYear = currentYear
    
    // Determine term based on month
    if (currentMonth >= 8 && currentMonth <= 11) { // Sep-Dec: Term 1
      term = 1
    } else if (currentMonth >= 0 && currentMonth <= 3) { // Jan-Apr: Term 2
      term = 2
      academicStartYear = currentYear - 1 // Academic year started last year
    } else { // May-Aug: Term 3
      term = 3
      academicStartYear = currentYear - 1 // Academic year started last year
    }
    
    const academicYearStr = `AY ${academicStartYear}-${academicStartYear + 1}, Term ${term}`
    setAcademicYear(academicYearStr)
  }, [])

  const addCourse = useCallback(() => {
    // max courses will be 8
    if (courses.length < 8) {
      setCourses(prevCourses => [...prevCourses, { id: nextId, title: "", units: "3", grade: 4.0 }])
      setNextId(prevId => prevId + 1)
    } else {
      toast.error("You've hit the maximum number of courses")
    }
  }, [courses.length, nextId])

  const deleteAllCourses = useCallback(() => {
    initializeBlankCourses()
  }, [initializeBlankCourses])

  const removeCourse = useCallback((id: number) => {
    setCourses(prevCourses => prevCourses.filter(course => course.id !== id))
  }, [])

  const updateCourse = useCallback((id: number, field: keyof Course, value: string | number) => {
    setCourses(prevCourses => 
      prevCourses.map((course) => {
        if (course.id === id) {
          return { ...course, [field]: value }
        }
        return course
      })
    )
  }, [])

  const calculateGPA = useCallback(() => {
    // check if units and grades are valid for GPA calculation
    const validUnits = courses.every(course => course.units !== "" && parseInt(course.units) > 0)
    const validGrades = courses.every(course => course.grade !== 0)

    if (!validUnits || !validGrades) {
      toast.error("Please fill in units and grades")
      return
    }

    setIsCalculating(true)

    // Debounce calculation for UI feedback
    setTimeout(() => {
      if (courses.length === 0) {
        setGpa(0)
        setRecognition("")
        setIsCalculating(false)
        return
      }

      let totalWeightedGrade = 0
      let totalUnits = 0

      courses.forEach((course) => {
        const units = parseInt(course.units) || 0
        totalWeightedGrade += units * course.grade
        totalUnits += units
      })

      if (totalUnits === 0) {
        setGpa(0)
        setRecognition("")
        setIsCalculating(false)
        return
      }

      const calculatedGPA = totalWeightedGrade / totalUnits
      const totalUnitsSum = courses.reduce((sum, course) => sum + (parseInt(course.units) || 0), 0)
      
      // Determine recognition
      let recognitionText = ""
      const allCoursesPassMinGrade = courses.every(course => course.grade >= RECOGNITION.FIRST_HONORS.MIN_GRADE)
      
      if (calculatedGPA >= RECOGNITION.FIRST_HONORS.MIN_GPA && 
          allCoursesPassMinGrade && 
          totalUnitsSum >= RECOGNITION.FIRST_HONORS.MIN_UNITS) {
        recognitionText = RECOGNITION.FIRST_HONORS.LABEL
      } else if (calculatedGPA >= RECOGNITION.SECOND_HONORS.MIN_GPA && 
                calculatedGPA < RECOGNITION.SECOND_HONORS.MAX_GPA && 
                allCoursesPassMinGrade && 
                totalUnitsSum >= RECOGNITION.SECOND_HONORS.MIN_UNITS) {
        recognitionText = RECOGNITION.SECOND_HONORS.LABEL
      }

      setGpa(calculatedGPA)
      setRecognition(recognitionText)
      setIsCalculating(false)
    }, 600) // Reduced delay for better responsiveness

    toast.success("You can also download the GPA as an image!")
  }, [courses])

  // Memoized computed values
  const totalUnits = useMemo(() => {
    return courses.reduce((sum, course) => sum + (parseInt(course.units) || 0), 0)
  }, [courses])

  const isValid = useMemo(() => {
    return courses.every(course => course.units !== "" && parseInt(course.units) > 0) &&
           courses.every(course => course.grade !== null);
  }, [courses])

  const downloadImage = useCallback(() => {
    if (!cardRef.current) return
    
    setIsDownloading(true)
    setIsCapturing(true)
    
    // Add a class to the document body to trigger CSS hiding dropdown chevrons
    document.body.classList.add('capturing-screenshot')
    
    // Short delay to allow the DOM to update with the isCapturing class changes
    setTimeout(() => {
      if (!cardRef.current) {
        setIsDownloading(false)
        setIsCapturing(false)
        document.body.classList.remove('capturing-screenshot')
        return
      }
      
      const options = {
        quality: 0.95,
        backgroundColor: '#F2F0EF',
        width: cardRef.current.offsetWidth,
        height: cardRef.current.offsetHeight,
        style: {
          borderRadius: '8px',
          boxShadow: 'none',
          margin: '0'
        }
      }
      
      htmlToImage.toJpeg(cardRef.current, options)
        .then((dataUrl) => {
          const link = document.createElement('a')
          link.download = `dlsu-gpa-${gpa.toFixed(3)}.jpeg`
          link.href = dataUrl
          link.click()
          
          toast.success('GPA downloaded successfully!')
          setIsDownloading(false)
          setIsCapturing(false)
          document.body.classList.remove('capturing-screenshot')
        })
        .catch((error) => {
          console.error('Error generating image:', error)
          toast.error('Failed to download image')
          setIsDownloading(false)
          setIsCapturing(false)
          document.body.classList.remove('capturing-screenshot')
        })
    }, 100)
  }, [gpa])

  if (isLoading) {
    return <Loading />
  }

  if (!isLoading) return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#F2F0EF] relative">
      <div className="w-full max-w-[90%] md:max-w-[80%] lg:max-w-[60%]">
        <Card ref={cardRef} className={`relative w-full bg-[#F2F0EF] shadow-md overflow-hidden min-h-[730px] md:min-h-[700px] ${isCapturing ? 'min-h-fit' : ''}`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-2">
                <CardTitle className="md:text-2xl text-[#087830] font-bold">DLSU GPA Calculator</CardTitle>
                <CardDescription className="md:text-base font-semibold text-black">{academicYear}</CardDescription>
                <p className="text-sm text-gray-500 font-semibold">Total Units: {totalUnits}</p>
              </div>
              <div className={`flex gap-2 ${isCapturing ? 'hidden' : ''}`}>
                <Button 
                  variant="link" 
                  onClick={downloadImage} 
                  title="Download as Image"
                  className="hover:text-[#087830] cursor-pointer -mr-2"
                  disabled={isDownloading || gpa === 0}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="link" onClick={deleteAllCourses} title="Reset All Courses" className="hover:text-[#087830] cursor-pointer">
                  <RefreshCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[90px] md:min-w-[300px]">Course</TableHead>
                  <TableHead className="w-fit">Units</TableHead>
                  <TableHead className="w-fit">Grade</TableHead>
                  <TableHead className={`w-fit ${isCapturing ? 'hidden' : ''}`}>
                    <Button 
                      variant="link" 
                      onClick={addCourse} 
                      className="hover:text-[#087830] cursor-pointer" 
                      title="Add Course"
                      disabled={courses.length >= 8}
                    > 
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="min-w-[90px] md:min-w-[300px]">
                      <Input
                        type="text"
                        className="border-none shadow-none font-semibold text-sm md:text-base"
                        placeholder={`Course ${course.id} (Optional)`}
                        value={course.title}
                        onChange={(e) => updateCourse(course.id, "title", e.target.value)}
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
                          updateCourse(course.id, "units", value);
                        }}
                      />
                    </TableCell>
                    <TableCell className="w-fit">
                      <Select
                        value={course.grade.toString()}
                        onValueChange={(value) => updateCourse(course.id, "grade", parseFloat(value) || 0)}
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
                        onClick={() => removeCourse(course.id)} 
                        className={`hover:text-red-500 ${isCapturing ? 'hidden' : ''}`}
                        disabled={courses.length <= 1}
                        title="Remove Course"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className={`
              ${isCapturing ? '' : 'absolute bottom-6 left-6 right-6'}
              flex flex-col md:flex-row md:justify-between justify-center md:items-center mt-8 gap-6`}>
              <div className={`flex items-center h-8 text-sm md:text-base`}>
                <p className="font-bold">
                  {isCalculating ? (
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
                      <span className="block md:inline ml-1 text-[#087830]">{gpa.toFixed(3)}
                      {recognition && <span className="ml-1 text-[#087830]">({recognition})</span>}
                      </span>
                    </span>
                  )}
                </p>
              </div>
              <div className={`flex items-center h-8 ${isCapturing ? 'hidden' : ''}`}>
                <Button 
                  onClick={calculateGPA} 
                  disabled={isCalculating || !isValid} 
                  className="font-bold bg-[#087830] text-white cursor-pointer w-full md:w-fit"
                  title="Calculate GPA"
                >
                  {isCalculating ? "Calculating..." : "Calculate"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Footer positioned at the bottom right of the page */}
      <div className={`absolute bottom-4 right-4 flex items-center gap-2 text-sm text-gray-500 font-semibold ${isCapturing ? 'hidden' : ''}`}>
        <span>Made by dlmbaccay</span>
        <a 
          href="https://github.com/dlmbaccay" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-[#087830] transition-colors"
        >
          <FaGithub size={16} />
        </a>
        <a 
          href="https://linkedin.com/in/dlmbaccay" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-[#087830] transition-colors"
        >
          <FaLinkedin size={16} />
        </a>
      </div>
    </div>
  );
}
