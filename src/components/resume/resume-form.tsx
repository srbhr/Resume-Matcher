"use client";

import useResumeStore from "@/lib/stores/resume-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { motion } from "motion/react";
import BulletPointEditor from "./bullet-point-editor";

export default function ResumeForm() {
  const {
    resumeData,
    updatePersonal,
    updateExperience,
    updateExperienceResponsibilities,
    updateEducation,
    updateSkills,
  } = useResumeStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteType, setDeleteType] = useState<
    "experience" | "education" | null
  >(null);

  const handleDeleteExperience = (index: number) => {
    setDeleteIndex(index);
    setDeleteType("experience");
    setShowDeleteDialog(true);
  };

  const handleDeleteEducation = (index: number) => {
    setDeleteIndex(index);
    setDeleteType("education");
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (deleteIndex !== null && deleteType) {
      if (deleteType === "experience") {
        const newExp = [...resumeData.experience];
        newExp.splice(deleteIndex, 1);
        // Update the store by replacing the entire experience array
        const updatedStore = useResumeStore.getState();
        updatedStore.resumeData.experience = newExp;
        useResumeStore.setState({ resumeData: updatedStore.resumeData });
        toast.success("Experience entry removed successfully");
      } else if (deleteType === "education") {
        const newEdu = [...resumeData.education];
        newEdu.splice(deleteIndex, 1);
        // Update the store by replacing the entire education array
        const updatedStore = useResumeStore.getState();
        updatedStore.resumeData.education = newEdu;
        useResumeStore.setState({ resumeData: updatedStore.resumeData });
        toast.success("Education entry removed successfully");
      }
    }
    setShowDeleteDialog(false);
    setDeleteIndex(null);
    setDeleteType(null);
  };

  return (
    <div className="h-full w-full bg-background overflow-y-auto overflow-x-hidden p-6">
      <div className="bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl p-6 w-full">
        {/* Header */}
        <div className="mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Edit Resume
            </h2>
            <p className="text-muted-foreground">
              Fill in your information and see the preview update in real-time
            </p>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="space-y-6">
          {/* Personal Information Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="border-0 bg-card/80 backdrop-blur-sm grainy">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold mr-3">
                    1
                  </span>
                  Personal Information
                  {resumeData.personal.name &&
                    resumeData.personal.email &&
                    resumeData.personal.phone &&
                    resumeData.personal.title && (
                      <Badge variant="outline" className="ml-auto">
                        Complete
                      </Badge>
                    )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={resumeData.personal.name}
                      onChange={(e) => updatePersonal("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={resumeData.personal.email}
                      onChange={(e) => updatePersonal("email", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="text"
                      placeholder="+1 (555) 123-4567"
                      value={resumeData.personal.phone}
                      onChange={(e) => updatePersonal("phone", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="title">Professional Title *</Label>
                    <Input
                      id="title"
                      type="text"
                      placeholder="e.g., Software Engineer, Product Manager"
                      value={resumeData.personal.title}
                      onChange={(e) => updatePersonal("title", e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Experience Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="border-0 bg-card/80 backdrop-blur-sm grainy">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold mr-3">
                    2
                  </span>
                  Experience
                  {resumeData.experience.length > 0 &&
                    resumeData.experience.some(
                      (exp) =>
                        exp.company &&
                        exp.position &&
                        exp.duration &&
                        (exp.responsibilities?.length ?? 0) > 0
                    ) && (
                      <Badge variant="outline" className="ml-auto">
                        Complete
                      </Badge>
                    )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {resumeData.experience.map((exp, index) => (
                    <Card key={index} className="relative">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-medium">
                            Experience #{index + 1}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExperience(index)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor={`company-${index}`}>
                              Company *
                            </Label>
                            <Input
                              id={`company-${index}`}
                              type="text"
                              placeholder="Company name"
                              value={exp.company || ""}
                              onChange={(e) =>
                                updateExperience(
                                  index,
                                  "company",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`position-${index}`}>
                              Position *
                            </Label>
                            <Input
                              id={`position-${index}`}
                              type="text"
                              placeholder="Job title"
                              value={exp.position || ""}
                              onChange={(e) =>
                                updateExperience(
                                  index,
                                  "position",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`duration-${index}`}>
                              Duration
                            </Label>
                            <Input
                              id={`duration-${index}`}
                              type="text"
                              placeholder="e.g., Jan 2023 - Present"
                              value={exp.duration || ""}
                              onChange={(e) =>
                                updateExperience(
                                  index,
                                  "duration",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <BulletPointEditor
                            label="Key Responsibilities & Achievements"
                            placeholder="e.g., Led development of key features"
                            value={exp.responsibilities || []}
                            onChange={(responsibilities) =>
                              updateExperienceResponsibilities(
                                index,
                                responsibilities
                              )
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => {
                      updateExperience(
                        resumeData.experience.length,
                        "company",
                        ""
                      );
                      toast.success("New experience entry added");
                    }}
                    className="w-full md:w-auto"
                    variant="outline"
                  >
                    + Add Experience
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Education Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="border-0 bg-card/80 backdrop-blur-sm grainy">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold mr-3">
                    3
                  </span>
                  Education
                  {resumeData.education.length > 0 &&
                    resumeData.education.some(
                      (edu) => edu.institution && edu.degree
                    ) && (
                      <Badge variant="outline" className="ml-auto">
                        Complete
                      </Badge>
                    )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {resumeData.education.map((edu, index) => (
                    <Card key={index} className="relative">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-medium">
                            Education #{index + 1}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEducation(index)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`institution-${index}`}>
                              Institution *
                            </Label>
                            <Input
                              id={`institution-${index}`}
                              type="text"
                              placeholder="University/School name"
                              value={edu.institution || ""}
                              onChange={(e) =>
                                updateEducation(
                                  index,
                                  "institution",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`degree-${index}`}>Degree *</Label>
                            <Input
                              id={`degree-${index}`}
                              type="text"
                              placeholder="Degree/Program name"
                              value={edu.degree || ""}
                              onChange={(e) =>
                                updateEducation(index, "degree", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`start-date-${index}`}>
                              Start Date
                            </Label>
                            <Input
                              id={`start-date-${index}`}
                              type="text"
                              placeholder="e.g., Sep 2020"
                              value={(edu as any)["start-date"] || ""}
                              onChange={(e) =>
                                updateEducation(
                                  index,
                                  "start-date",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`graduation-date-${index}`}>
                              Graduation Date
                            </Label>
                            <Input
                              id={`graduation-date-${index}`}
                              type="text"
                              placeholder="e.g., May 2024"
                              value={edu["graduation-date"] || ""}
                              onChange={(e) =>
                                updateEducation(
                                  index,
                                  "graduation-date",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => {
                      updateEducation(
                        resumeData.education.length,
                        "institution",
                        ""
                      );
                      toast.success("New education entry added");
                    }}
                    className="w-full md:w-auto"
                    variant="outline"
                  >
                    + Add Education
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Skills Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <Card className="border-0 bg-card/80 backdrop-blur-sm grainy">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold mr-3">
                    4
                  </span>
                  Skills
                  {resumeData.skills.length > 0 && (
                    <Badge variant="outline" className="ml-auto">
                      Complete
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="skills">Skills (separate with commas)</Label>
                  <Textarea
                    id="skills"
                    placeholder="JavaScript, React, Node.js, Python, SQL..."
                    value={resumeData.skills.join(", ")}
                    onChange={(e) => updateSkills(e.target.value.split(", "))}
                    className="mt-1"
                  />
                  {resumeData.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {resumeData.skills.map((skill, index) => (
                        <Badge key={index} variant="default">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this {deleteType}? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
