import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlayCircle, BookOpen, Award, Clock, CheckCircle } from "lucide-react";

const courses = [
  { id: 1, title: "Advanced React Patterns", instructor: "Kent C. Dodds", duration: "4h 30m", progress: 45, category: "Engineering", img: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=800&q=80" },
  { id: 2, title: "Effective Leadership 101", instructor: "Simon Sinek", duration: "2h 15m", progress: 0, category: "Management", img: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80" },
  { id: 3, title: "Cybersecurity Fundamentals", instructor: "Agent Smith", duration: "6h 00m", progress: 100, category: "Compliance", img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80" },
];

export default function Training() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Learning & Development</h1>
          <p className="text-slate-500 text-sm">Upskill your career with premium courses.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <BookOpen className="h-4 w-4 mr-2" /> Browse Catalog
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <Card className="bg-slate-900 text-white border-none shadow-lg lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 to-transparent z-10" />
          <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80" className="absolute inset-0 w-full h-full object-cover opacity-50" />
          <CardContent className="relative z-20 p-8 h-full flex flex-col justify-center">
            <Badge className="w-fit mb-4 bg-blue-600 hover:bg-blue-700 border-none">Featured Course</Badge>
            <h2 className="text-3xl font-bold mb-2">AI for Business Strategy</h2>
            <p className="text-slate-300 mb-6 max-w-lg">Learn how to leverage artificial intelligence to drive decision making and optimize operations in the modern enterprise.</p>
            <Button size="lg" className="w-fit bg-white text-slate-900 hover:bg-slate-100">
              <PlayCircle className="h-5 w-5 mr-2" /> Start Learning
            </Button>
          </CardContent>
        </Card>
        
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
             <CardTitle>My Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 text-green-600 rounded-full">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">12</p>
                <p className="text-xs text-slate-500">Certificates Earned</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">45h</p>
                <p className="text-xs text-slate-500">Learning Time</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <h3 className="font-bold text-slate-900 text-lg mb-4">My Courses</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <Card key={course.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-all group cursor-pointer overflow-hidden">
            <div className="h-40 w-full relative">
               <img src={course.img} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
               <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
               <Badge className="absolute top-3 right-3 bg-white/90 text-slate-900 hover:bg-white">{course.category}</Badge>
               {course.progress === 100 && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                   <CheckCircle className="h-12 w-12 text-green-400" />
                 </div>
               )}
            </div>
            <CardContent className="p-5">
              <h4 className="font-bold text-slate-900 mb-1">{course.title}</h4>
              <p className="text-xs text-slate-500 mb-4">by {course.instructor} • {course.duration}</p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600">{course.progress}% Complete</span>
                </div>
                <Progress value={course.progress} className="h-1.5" />
              </div>
              
              <Button variant="ghost" className="w-full mt-4 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-0 h-auto justify-start">
                {course.progress === 0 ? 'Start Course' : course.progress === 100 ? 'View Certificate' : 'Resume Learning'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
