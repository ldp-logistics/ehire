import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, X, Send, Bot } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi there! I'm your HR Assistant. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", text: input }]);
    setInput("");
    
    // Mock response
    setTimeout(() => {
      setMessages(prev => [...prev, { role: "bot", text: "I can help with that! Let me search the policy documents..." }]);
    }, 1000);
  };

  return (
    <>
      <Button 
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl bg-blue-600 hover:bg-blue-700 z-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-80 shadow-2xl z-50 border-slate-200 animate-in slide-in-from-bottom-10 fade-in">
          <CardHeader className="bg-blue-600 text-white p-4 rounded-t-xl">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" /> HR Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex flex-col h-96">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'bot' && (
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                      AI
                    </div>
                  )}
                  <div className={`p-3 rounded-lg text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 bg-white">
              <div className="flex gap-2">
                <Input 
                  placeholder="Type a message..." 
                  className="flex-1 text-sm" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <Button size="icon" onClick={handleSend}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
