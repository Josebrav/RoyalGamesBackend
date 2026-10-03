import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BannerSlide } from './entities/banner-slide.entity';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable()
export class BannerSlidesService {
  constructor(
    @InjectRepository(BannerSlide)
    private readonly bannerSlideRepository: Repository<BannerSlide>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll(): Promise<BannerSlide[]> {
    return this.bannerSlideRepository.find({ order: { createdAt: 'ASC' } });
  }

  async create(file: Express.Multer.File, createdBy: string, linkTo: string | null = null): Promise<BannerSlide> {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagen no permitido. Usá JPG, PNG o WEBP.');
    }

    const { url, publicId } = await this.cloudinaryService.uploadImage(file.buffer, 'banner-slides');

    const slide = this.bannerSlideRepository.create({
      imageUrl: url,
      imagePublicId: publicId,
      linkTo: linkTo?.trim() || null,
      createdBy,
    });
    return this.bannerSlideRepository.save(slide);
  }

  async updateLink(id: string, linkTo: string | null): Promise<BannerSlide> {
    const slide = await this.bannerSlideRepository.findOne({ where: { id } });
    if (!slide) {
      throw new NotFoundException('Slide not found');
    }
    slide.linkTo = linkTo?.trim() || null;
    return this.bannerSlideRepository.save(slide);
  }

  async remove(id: string): Promise<void> {
    const slide = await this.bannerSlideRepository.findOne({ where: { id } });
    if (!slide) {
      throw new NotFoundException('Slide not found');
    }
    await this.bannerSlideRepository.remove(slide);
    await this.cloudinaryService.deleteImage(slide.imagePublicId);
  }
}
