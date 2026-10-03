import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteContentBlock } from './entities/site-content-block.entity';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable()
export class SiteContentService {
  constructor(
    @InjectRepository(SiteContentBlock)
    private readonly siteContentRepository: Repository<SiteContentBlock>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getAll(): Promise<Record<string, { type: string; text?: string; imageUrl?: string; linkTo?: string | null }>> {
    const blocks = await this.siteContentRepository.find();
    const result: Record<string, { type: string; text?: string; imageUrl?: string; linkTo?: string | null }> = {};
    for (const block of blocks) {
      if (block.type === 'text') {
        result[block.key] = { type: 'text', text: block.textValue ?? '' };
      } else {
        result[block.key] = { type: 'image', imageUrl: block.imageUrl ?? '', linkTo: block.linkTo ?? null };
      }
    }
    return result;
  }

  async setText(key: string, text: string, updatedBy: string): Promise<void> {
    let block = await this.siteContentRepository.findOne({ where: { key } });
    if (!block) {
      block = this.siteContentRepository.create({ key, type: 'text' });
    }
    block.type = 'text';
    block.textValue = text;
    block.updatedBy = updatedBy;
    await this.siteContentRepository.save(block);
  }

  async setImage(key: string, file: Express.Multer.File, updatedBy: string): Promise<{ imageUrl: string; linkTo: string | null }> {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagen no permitido. Usá JPG, PNG o WEBP.');
    }

    let block = await this.siteContentRepository.findOne({ where: { key } });
    const previousPublicId = block?.imagePublicId;

    const { url, publicId } = await this.cloudinaryService.uploadImage(file.buffer, 'site-content');

    if (!block) {
      block = this.siteContentRepository.create({ key, type: 'image' });
    }
    block.type = 'image';
    block.imageUrl = url;
    block.imagePublicId = publicId;
    block.updatedBy = updatedBy;
    await this.siteContentRepository.save(block);

    if (previousPublicId) {
      await this.cloudinaryService.deleteImage(previousPublicId);
    }

    return { imageUrl: url, linkTo: block.linkTo };
  }

  async setLink(key: string, linkTo: string | null, updatedBy: string): Promise<{ linkTo: string | null }> {
    let block = await this.siteContentRepository.findOne({ where: { key } });
    if (!block) {
      block = this.siteContentRepository.create({ key, type: 'image' });
    }
    block.linkTo = linkTo?.trim() || null;
    block.updatedBy = updatedBy;
    await this.siteContentRepository.save(block);
    return { linkTo: block.linkTo };
  }
}
