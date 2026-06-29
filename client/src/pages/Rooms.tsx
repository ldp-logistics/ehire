import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, MapPin, Plus } from "lucide-react";

const rooms = [
  { id: 1, name: "The Matrix", capacity: 12, amenities: ["TV", "Whiteboard", "VC"], status: "Available", next: "2:00 PM" },
  { id: 2, name: "Zion", capacity: 6, amenities: ["Whiteboard"], status: "Occupied", next: "3:30 PM" },
  { id: 3, name: "Nebuchadnezzar", capacity: 20, amenities: ["Projector", "VC", "Catering"], status: "Available", next: "1:00 PM" },
  { id: 4, name: "The Construct", capacity: 4, amenities: ["TV"], status: "Occupied", next: "4:00 PM" },
];

export default function Rooms() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Meeting Rooms</h1>
          <p className="text-slate-500 text-sm">Book spaces for your team.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Quick Book
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {rooms.map((room) => (
          <Card key={room.id} className={`border-l-4 shadow-sm ${room.status === 'Available' ? 'border-l-green-500 border-slate-200' : 'border-l-red-500 border-slate-200'}`}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <Badge className={`${room.status === 'Available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {room.status}
                </Badge>
                <div className="flex items-center text-xs text-slate-500">
                  <Users className="h-3 w-3 mr-1" /> {room.capacity}
                </div>
              </div>
              
              <h3 className="font-bold text-slate-900 text-lg mb-1">{room.name}</h3>
              <p className="text-xs text-slate-500 mb-4 flex items-center">
                <Clock className="h-3 w-3 mr-1" /> Free until {room.next}
              </p>

              <div className="flex flex-wrap gap-1 mb-4">
                {room.amenities.map(a => (
                  <Badge key={a} variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">{a}</Badge>
                ))}
              </div>

              <Button className="w-full" variant={room.status === 'Available' ? 'default' : 'outline'} disabled={room.status === 'Occupied'}>
                {room.status === 'Available' ? 'Book Now' : 'Occupied'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Schedule View</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-400 text-sm">
             Calendar Grid Visualization Placeholder
           </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
