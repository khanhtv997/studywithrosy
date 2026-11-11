import { Body, Controller, Get, Header, Inject, Param, Post, StreamableFile } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentImportService } from './student-import.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ClassesService } from '../classes/classes.service';
import type { PublicUser } from '../users/users.service';

/** The import endpoints validate the body themselves; only the target class is checked here. */
const classIdOf = (body: unknown) => typeof (body as { classId?: unknown })?.classId === 'string' ? (body as { classId: string }).classId : '';

@Roles('admin', 'teacher')
@Controller('students')
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(StudentImportService) private readonly importer: StudentImportService,
    @Inject(ClassesService) private readonly classes: ClassesService,
  ) {}
  @Get() list(@CurrentUser() user: PublicUser) { return this.students.findAllFor(user); }

  @Get('import/template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="mau-danh-sach-hoc-sinh.xlsx"')
  async template() { return new StreamableFile(await this.importer.template()); }
  /** Reads an uploaded .xlsx and says what saving it would do; nothing is written. */
  @Post('import/preview') async preview(@Body() body: unknown, @CurrentUser() user: PublicUser) {
    await this.classes.findOneFor(user, classIdOf(body));
    return this.importer.preview(body);
  }
  @Post('import') async commit(@Body() body: unknown, @CurrentUser() user: PublicUser) {
    await this.classes.findOneFor(user, classIdOf(body));
    return this.importer.commit(body);
  }

  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: PublicUser) { return this.students.findOneFor(user, id); }
  @Post() create(@Body() body: unknown, @CurrentUser() user: PublicUser) { return this.students.create(body, user); }
}
