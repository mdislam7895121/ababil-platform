'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, MessageSquare, Plus, Clock, CheckCircle, XCircle, AlertTriangle, Wrench, Send, ChevronRight } from 'lucide-react';

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  solvedAt?: string;
  messages?: SupportMessage[];
  hoursOpen?: number;
  slaHours?: number;
  slaBreached?: boolean;
}

interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: string;
  message: string;
  attachments: any[];
  createdAt: string;
}

interface FixMyDeployIssue {
  issue: string;
  severity: 'error' | 'warning' | 'info';
  whyBlocks: string;
  fixSteps: string[];
  autoFixable: boolean;
}

interface FixMyDeployResult {
  status: 'blocked' | 'warnings' | 'ready';
  summary: { errors: number; warnings: number; total: number };
  checklist: FixMyDeployIssue[];
  lastVerificationAt: string | null;
  lastVerificationStatus: string | null;
}

export default function SupportPage() {
  const { token, currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [fixMyDeployResult, setFixMyDeployResult] = useState<FixMyDeployResult | null>(null);
  const [fixMyDeployLoading, setFixMyDeployLoading] = useState(false);
  
  const [newTicket, setNewTicket] = useState({
    subject: '',
    message: '',
    category: 'question',
    priority: 'medium'
  });

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/support/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetails = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data.ticket);
      }
    } catch (error) {
      console.error('Failed to fetch ticket details:', error);
    }
  };

  const createTicket = async () => {
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify(newTicket)
      });
      if (res.ok) {
        setShowNewTicket(false);
        setNewTicket({ subject: '', message: '', category: 'question', priority: 'medium' });
        fetchTickets();
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
    }
  };

  const sendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({ message: newMessage })
      });
      if (res.ok) {
        setNewMessage('');
        fetchTicketDetails(selectedTicket.id);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchTickets();
        if (selectedTicket?.id === ticketId) {
          fetchTicketDetails(ticketId);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const runFixMyDeploy = async () => {
    setFixMyDeployLoading(true);
    try {
      const res = await fetch('/api/support/fix-my-deploy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setFixMyDeployResult(data);
      }
    } catch (error) {
      console.error('Failed to run Fix My Deploy:', error);
    } finally {
      setFixMyDeployLoading(false);
    }
  };

  useEffect(() => {
    if (token && tenantId) {
      fetchTickets();
    }
  }, [token, tenantId]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'waiting': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'solved': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info': return <AlertCircle className="w-5 h-5 text-blue-500" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="support-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Support Center</h1>
          <p className="text-muted-foreground">Get help with your workspace and deployments</p>
        </div>
        <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-ticket">
              <Plus className="w-4 h-4 mr-2" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" data-testid="dialog-new-ticket">
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Brief description of your issue"
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  data-testid="input-ticket-subject"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={newTicket.category} onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}>
                    <SelectTrigger data-testid="select-ticket-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deploy">Deployment</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="preview">Preview</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="question">General Question</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}>
                    <SelectTrigger data-testid="select-ticket-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Describe your issue in detail..."
                  rows={5}
                  value={newTicket.message}
                  onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
                  data-testid="input-ticket-message"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewTicket(false)}>Cancel</Button>
              <Button 
                onClick={createTicket}
                disabled={!newTicket.subject || !newTicket.message}
                data-testid="button-submit-ticket"
              >
                Submit Ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="tickets" className="w-full">
        <TabsList>
          <TabsTrigger value="tickets" data-testid="tab-tickets">
            <MessageSquare className="w-4 h-4 mr-2" />
            My Tickets
          </TabsTrigger>
          <TabsTrigger value="fix-deploy" data-testid="tab-fix-deploy">
            <Wrench className="w-4 h-4 mr-2" />
            Fix My Deploy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Your Tickets</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-4 text-center text-muted-foreground">Loading...</div>
                  ) : tickets.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">No tickets yet</div>
                  ) : (
                    <div className="divide-y">
                      {tickets.map((ticket) => (
                        <div 
                          key={ticket.id}
                          className={`p-3 cursor-pointer hover:bg-muted/50 ${selectedTicket?.id === ticket.id ? 'bg-muted' : ''}`}
                          onClick={() => fetchTicketDetails(ticket.id)}
                          data-testid={`ticket-item-${ticket.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate flex-1">{ticket.subject}</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                              {ticket.priority}
                            </Badge>
                            <Badge variant="outline" className={getStatusColor(ticket.status)}>
                              {ticket.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(ticket.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2">
              {selectedTicket ? (
                <Card>
                  <CardHeader className="border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle data-testid="text-ticket-subject">{selectedTicket.subject}</CardTitle>
                        <CardDescription>
                          {selectedTicket.category} • Created {new Date(selectedTicket.createdAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(selectedTicket.priority)}>
                          {selectedTicket.priority}
                        </Badge>
                        <Select 
                          value={selectedTicket.status} 
                          onValueChange={(v) => updateTicketStatus(selectedTicket.id, v)}
                        >
                          <SelectTrigger className="w-32" data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="waiting">Waiting</SelectItem>
                            <SelectItem value="solved">Solved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-80 overflow-y-auto p-4 space-y-4" data-testid="messages-container">
                      {selectedTicket.messages?.map((msg) => (
                        <div 
                          key={msg.id}
                          className={`flex ${msg.authorRole === 'customer' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[80%] rounded-lg p-3 ${
                            msg.authorRole === 'customer' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          }`}>
                            <div className="text-sm font-medium mb-1 capitalize">
                              {msg.authorRole}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
                            <div className="text-xs opacity-70 mt-1">
                              {new Date(msg.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t p-4">
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Type your message..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          className="flex-1"
                          data-testid="input-reply"
                        />
                        <Button 
                          onClick={sendMessage}
                          disabled={!newMessage.trim()}
                          data-testid="button-send-reply"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a ticket to view the conversation</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="fix-deploy" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    Fix My Deploy
                  </CardTitle>
                  <CardDescription>
                    Diagnose and fix deployment blockers
                  </CardDescription>
                </div>
                <Button 
                  onClick={runFixMyDeploy} 
                  disabled={fixMyDeployLoading}
                  data-testid="button-run-fix-deploy"
                >
                  {fixMyDeployLoading ? 'Analyzing...' : 'Run Diagnostics'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fixMyDeployResult ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 rounded-lg border" data-testid="fix-deploy-status">
                    {fixMyDeployResult.status === 'ready' ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-green-500" />
                        <div>
                          <div className="font-semibold text-green-700 dark:text-green-400">Ready to Deploy</div>
                          <div className="text-sm text-muted-foreground">No blocking issues found</div>
                        </div>
                      </>
                    ) : fixMyDeployResult.status === 'warnings' ? (
                      <>
                        <AlertTriangle className="w-8 h-8 text-yellow-500" />
                        <div>
                          <div className="font-semibold text-yellow-700 dark:text-yellow-400">Deploy with Warnings</div>
                          <div className="text-sm text-muted-foreground">
                            {fixMyDeployResult.summary.warnings} warnings to review
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-8 h-8 text-red-500" />
                        <div>
                          <div className="font-semibold text-red-700 dark:text-red-400">Deployment Blocked</div>
                          <div className="text-sm text-muted-foreground">
                            {fixMyDeployResult.summary.errors} errors must be fixed
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {fixMyDeployResult.lastVerificationAt && (
                    <div className="text-sm text-muted-foreground">
                      Last verification: {new Date(fixMyDeployResult.lastVerificationAt).toLocaleString()} 
                      ({fixMyDeployResult.lastVerificationStatus})
                    </div>
                  )}

                  <div className="space-y-4" data-testid="fix-deploy-checklist">
                    {fixMyDeployResult.checklist.map((item, idx) => (
                      <Card key={idx} className="border-l-4" style={{
                        borderLeftColor: item.severity === 'error' ? '#ef4444' : 
                                        item.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                      }}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            {getSeverityIcon(item.severity)}
                            <div className="flex-1">
                              <div className="font-medium" data-testid={`issue-${idx}`}>{item.issue}</div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {item.whyBlocks}
                              </div>
                              <div className="mt-3">
                                <div className="text-sm font-medium mb-2">Fix Steps:</div>
                                <ol className="list-decimal list-inside text-sm space-y-1 text-muted-foreground">
                                  {item.fixSteps.map((step, stepIdx) => (
                                    <li key={stepIdx}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                              {item.autoFixable && (
                                <Badge variant="outline" className="mt-2">
                                  Auto-fixable
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {fixMyDeployResult.checklist.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                        <p>All deployment checks passed!</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Click "Run Diagnostics" to analyze your deployment</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
