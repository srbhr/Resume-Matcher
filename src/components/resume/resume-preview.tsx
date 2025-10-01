"use client";

import useResumeStore from "@/lib/stores/resume-store";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function ResumePreview() {
  const { resumeData } = useResumeStore();

  return (
    <div className="h-full w-full bg-background flex flex-col">
      {/* Resume Content */}
      <div className="flex-1 flex items-start justify-center overflow-auto">
        <div className="bg-card shadow-2xl w-full max-w-[8.5in] min-h-[11in] max-h-full">
          <div className="p-6 md:p-8">
            {/* Header Section */}
            <div className="mb-6 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-2 text-card-foreground">
                {resumeData.personal.name || "Your Name"}
              </h2>
              <p className="text-lg text-muted-foreground mb-1">
                {resumeData.personal.title || "Your Title"}
              </p>
              <p className="text-sm text-muted-foreground">
                {resumeData.personal.email && `${resumeData.personal.email} • `}
                {resumeData.personal.phone}
              </p>
            </div>

            <Separator className="mb-6" />

            {/* Experience Section */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3 text-card-foreground border-b border-border pb-1">
                Experience
              </h3>
              {resumeData.experience.length > 0 ? (
                <div className="space-y-4">
                  {resumeData.experience.map((exp, index) => (
                    <div key={index} className="pl-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-semibold text-card-foreground">
                          {exp.company || "Company"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {exp.duration || ""}
                        </p>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        {exp.position || "Position"}
                      </p>
                      {exp.responsibilities &&
                        exp.responsibilities.length > 0 && (
                          <ul className="list-disc list-inside text-sm text-card-foreground space-y-1">
                            {exp.responsibilities.map((resp, respIndex) => (
                              <li key={respIndex} className="leading-relaxed">
                                {resp}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No experience added yet.
                </p>
              )}
            </div>

            <Separator className="mb-6" />

            {/* Education Section */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3 text-card-foreground border-b border-border pb-1">
                Education
              </h3>
              {resumeData.education.length > 0 ? (
                <div className="space-y-4">
                  {resumeData.education.map((edu, index) => (
                    <div key={index} className="pl-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-semibold text-card-foreground">
                          {edu.institution || "Institution"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {(edu as any)["start-date"] && edu["graduation-date"]
                            ? `${(edu as any)["start-date"]} - ${
                                edu["graduation-date"]
                              }`
                            : edu["graduation-date"] ||
                              (edu as any)["start-date"] ||
                              ""}
                        </p>
                      </div>
                      <p className="text-muted-foreground">
                        {edu.degree || "Degree"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No education added yet.
                </p>
              )}
            </div>

            <Separator className="mb-6" />

            {/* Projects Section */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3 text-card-foreground border-b border-border pb-1">
                Projects
              </h3>
              {resumeData.projects.length > 0 ? (
                <div className="space-y-4">
                  {resumeData.projects.map((project, index) => (
                    <div key={index} className="pl-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-semibold text-card-foreground">
                          {project.name || "Project Name"}
                        </p>
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            View Project
                          </a>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-muted-foreground mb-2">
                          {project.description}
                        </p>
                      )}
                      {project.technologies &&
                        project.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {project.technologies.map((tech, techIndex) => (
                              <Badge
                                key={techIndex}
                                variant="outline"
                                className="text-xs"
                              >
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        )}
                      {project.achievements &&
                        project.achievements.length > 0 && (
                          <ul className="list-disc list-inside text-sm text-card-foreground space-y-1">
                            {project.achievements.map(
                              (achievement, achievementIndex) => (
                                <li
                                  key={achievementIndex}
                                  className="leading-relaxed"
                                >
                                  {achievement}
                                </li>
                              )
                            )}
                          </ul>
                        )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No projects added yet.
                </p>
              )}
            </div>

            <Separator className="mb-6" />

            {/* Skills Section */}
            <div>
              <h3 className="text-xl font-semibold mb-3 text-card-foreground border-b border-border pb-1">
                Skills
              </h3>
              {resumeData.skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {resumeData.skills.map((skill, index) => (
                    <Badge key={index} variant="outline">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No skills added yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
