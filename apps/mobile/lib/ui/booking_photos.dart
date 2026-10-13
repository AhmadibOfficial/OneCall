import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../core/api.dart';
import 'common.dart';
import 'resource_widgets.dart';

class BookingPhotos extends StatefulWidget {
  const BookingPhotos({
    super.key,
    required this.api,
    required this.orderId,
    required this.closed,
  });
  final OneCallApi api;
  final String orderId;
  final bool closed;
  @override
  State<BookingPhotos> createState() => _BookingPhotosState();
}

class _BookingPhotosState extends State<BookingPhotos> {
  late Future<List<dynamic>> _photos = _load();
  bool _busy = false;
  String? _error;
  Future<List<dynamic>> _load() async =>
      await widget.api.request('GET', '/orders/${widget.orderId}/photos')
          as List;
  Future<void> _add() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 80,
      );
      if (file == null) return;
      if (await file.length() > 5 * 1024 * 1024) {
        throw const ApiFailure('Choose a photo smaller than 5 MB.');
      }
      final bytes = await file.readAsBytes();
      await widget.api.uploadBookingPhoto(widget.orderId, bytes);
      if (mounted) {
        setState(() {
          _photos = _load();
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _view(String id) async {
    try {
      final bytes = await widget.api.bookingPhotoBytes(widget.orderId, id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => Dialog(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: InteractiveViewer(
                  child: Image.memory(
                    Uint8List.fromList(bytes),
                    errorBuilder: (_, _, _) =>
                        const Text('This photo could not be displayed.'),
                  ),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      if (mounted) notice(context, errorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Booking photos',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Only you and the assigned provider can view these photos. Avoid identity documents and private details; photos may contain metadata.',
          ),
          FutureBuilder<List<dynamic>>(
            future: _photos,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return TextButton(
                  onPressed: () => setState(() => _photos = _load()),
                  child: const Text('Retry loading photos'),
                );
              }
              if (!snapshot.hasData) return const LinearProgressIndicator();
              final values = snapshot.data!;
              return Wrap(
                spacing: 8,
                children: [
                  for (var i = 0; i < values.length; i++)
                    OutlinedButton.icon(
                      onPressed: () =>
                          _view((values[i] as Map)['id'] as String),
                      icon: const Icon(Icons.photo_outlined),
                      label: Text('Photo ${i + 1}'),
                    ),
                ],
              );
            },
          ),
          if (!widget.closed)
            TextButton.icon(
              onPressed: _busy ? null : _add,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(_busy ? 'Uploading…' : 'Add photo'),
            ),
          if (_error != null) ErrorNotice(_error!),
        ],
      ),
    ),
  );
}
